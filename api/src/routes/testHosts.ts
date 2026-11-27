import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { parseRefreshToken } from "../auth/jwt.js";
import { hashSecret } from "../auth/password.js";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { maySwitchInto } from "../lib/testMode/policy.js";
import { accessTokenFor, issueSession } from "./auth.js";

// Admin TEST HOSTS (migration 0011), the same model as AdVault's test
// customers (copied, not imported). An admin's own login gets "used up"
// (events, video invites, free daily limits), so a real admin can make
// separate host accounts and switch into them to walk the new-host path again.
//
// A test host is an ordinary `users` row with `test_owner_id` = the admin:
// role host, a *.invalid email (no mail can reach it), a random password nobody
// knows (it cannot log in; /auth/login also refuses it). lib/testMode treats it
// as test mode for good: 50-cent video invites tagged test_mode=1, and NO
// email to guests except the admin's own address.
//
// Switching issues a normal session (the same token pair /auth/login returns)
// for the other user. A session inside a test host carries the `testOwner`
// claim, and "Back to admin" is accepted only from such a session, re-checked
// against users.test_owner_id. The owner's REAL role is always read from the
// database, never the JWT.

const MAX_TEST_HOSTS = 50;

/**
 * The admin these calls act for: the caller when they are a real admin, or
 * the owner when the caller is inside one of that admin's test hosts.
 * Null = not allowed (403).
 */
export async function testHostOwner(req: FastifyRequest): Promise<string | null> {
  let ownerId = req.userId!;
  if (req.testOwnerClaim) {
    const [me] = await db.select({ testOwnerId: users.testOwnerId }).from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!me || me.testOwnerId !== req.testOwnerClaim) return null;
    ownerId = req.testOwnerClaim;
  }
  const [owner] = await db
    .select({ role: users.role, testOwnerId: users.testOwnerId })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);
  if (!owner || owner.role !== "admin" || owner.testOwnerId) return null;
  return ownerId;
}

/** Ends the session the caller is leaving, if the token is theirs. Best effort. */
async function endSession(refreshToken: string | undefined, userId: string): Promise<void> {
  const parsed = refreshToken ? parseRefreshToken(refreshToken) : null;
  if (!parsed) return;
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, parsed.sessionId), eq(sessions.userId, userId)))
    .catch(() => undefined);
}

const leaving = z.object({ refreshToken: z.string().min(1).max(500).optional() }).optional();

export async function testHostRoutes(app: FastifyInstance) {
  app.get("/test-hosts", { onRequest: requireAuth }, async (req, reply) => {
    const ownerId = await testHostOwner(req);
    if (!ownerId) return reply.code(403).send({ error: "admin_role_required" });
    const rows = await db
      .select({ id: users.id, displayName: users.displayName, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.testOwnerId, ownerId))
      .orderBy(asc(users.createdAt));
    return {
      hosts: rows.map((r) => ({ id: r.id, name: r.displayName ?? "Test host", createdAt: r.createdAt })),
      /** The test host this session is inside, or null for the admin's own. */
      current: req.userId === ownerId ? null : req.userId,
    };
  });

  app.post(
    "/test-hosts",
    { onRequest: requireAuth, schema: { body: z.object({ name: z.string().trim().min(1).max(120) }) } },
    async (req, reply) => {
      const ownerId = await testHostOwner(req);
      if (!ownerId) return reply.code(403).send({ error: "admin_role_required" });
      const { name } = req.body as { name: string };

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.testOwnerId, ownerId));
      if (existing.length >= MAX_TEST_HOSTS) return reply.code(409).send({ error: "too_many_test_hosts" });

      const [row] = await db
        .insert(users)
        .values({
          // RFC 2606 reserved TLD: undeliverable by definition.
          email: `test-${crypto.randomBytes(6).toString("hex")}@test.rsvpvault.invalid`,
          // Nobody knows this password; the account is entered only by switching.
          passwordHash: await hashSecret(crypto.randomBytes(32).toString("hex")),
          displayName: name,
          role: "host",
          testOwnerId: ownerId,
        })
        .returning({ id: users.id, displayName: users.displayName, createdAt: users.createdAt });
      // Deliberately NOT notifyNewUser: a test host is not a real sign-up.
      req.log.info({ ownerId, testHostId: row!.id }, "test host created");
      return reply.code(201).send({ id: row!.id, name: row!.displayName ?? name, createdAt: row!.createdAt });
    },
  );

  // Switch this session into one of the owner's test hosts. Answers the same
  // token pair as /auth/login; the browser swaps its stored tokens.
  app.post(
    "/test-hosts/:id/switch",
    { onRequest: requireAuth, schema: { params: z.object({ id: z.string().uuid() }), body: leaving } },
    async (req, reply) => {
      const ownerId = await testHostOwner(req);
      if (!ownerId) return reply.code(403).send({ error: "admin_role_required" });
      const { id } = req.params as { id: string };
      const [target] = await db
        .select({ id: users.id, role: users.role, testOwnerId: users.testOwnerId })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target || !maySwitchInto({ actorOwnerId: ownerId, target })) {
        return reply.code(404).send({ error: "test_host_not_found" });
      }
      const tokens = { accessToken: accessTokenFor(target), refreshToken: await issueSession(target.id) };
      await endSession((req.body as { refreshToken?: string } | undefined)?.refreshToken, req.userId!);
      req.log.info({ ownerId, from: req.userId, to: target.id }, "switched into test host");
      return tokens;
    },
  );

  // "Back to admin": only from a session inside a test host.
  app.post("/test-hosts/back", { onRequest: requireAuth, schema: { body: leaving } }, async (req, reply) => {
    if (!req.testOwnerClaim) return reply.code(403).send({ error: "not_in_test_host" });
    const ownerId = await testHostOwner(req);
    if (!ownerId) return reply.code(403).send({ error: "not_in_test_host" });
    const tokens = {
      accessToken: accessTokenFor({ id: ownerId, role: "admin" }),
      refreshToken: await issueSession(ownerId),
    };
    await endSession((req.body as { refreshToken?: string } | undefined)?.refreshToken, req.userId!);
    req.log.info({ ownerId, from: req.userId }, "switched back to admin");
    return tokens;
  });
}
