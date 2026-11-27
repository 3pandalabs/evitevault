import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { sendMail, type Mail, type SendResult } from "../mailer.js";
import { effectiveRole, inTestMode, isTestHost, splitGuestMail, type MailGuard, type Role } from "./policy.js";

// Admin tools: the database side. Read ./policy.ts first.

export type HostIdentity = {
  /** The role host flows act on (admin in test mode = host). */
  role: Role | undefined;
  /** Admin testing as host, or a test host: test prices, guest mail suppressed. */
  testMode: boolean;
  testHost: boolean;
  internal: boolean;
  /** Addresses guest mail may still reach in test mode (the real admin's own). */
  safeTo: string[];
};

/** How host flows (payments, guest email) should treat this user right now. */
export async function hostIdentity(userId: string): Promise<HostIdentity> {
  const [u] = await db
    .select({
      role: users.role,
      email: users.email,
      testAsHost: users.testAsHost,
      testOwnerId: users.testOwnerId,
      isInternal: users.isInternal,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { role: undefined, testMode: false, testHost: false, internal: false, safeTo: [] };

  const testHost = isTestHost(u);
  let safeTo = [u.email];
  if (testHost && u.testOwnerId) {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, u.testOwnerId)).limit(1);
    safeTo = owner ? [owner.email] : [];
  }
  return { role: effectiveRole(u), testMode: inTestMode(u), testHost, internal: u.isInternal, safeTo };
}

/** The JWT role, corrected for test mode, for host flows that gate on `req.userRole`. */
export async function customerFlowRole(req: FastifyRequest): Promise<Role | undefined> {
  if (req.userRole !== "admin" || !req.userId) return req.userRole;
  return (await hostIdentity(req.userId)).role;
}

export type GuestSendResult = SendResult & {
  /** Messages a test mode held back ("test: not sent"). */
  testSuppressed: number;
  /** Their addresses, so callers never mark those guests as invited. */
  suppressedRecipients: string[];
};

/**
 * Sends email to GUESTS on behalf of a host. Every host-initiated guest email
 * (invitations, the pending-invitations job, announcements, photo album,
 * greetings) goes through here, never straight to sendMail: in test mode
 * only the real admin's own address is reached; the rest is suppressed and
 * counted, never delivered.
 */
export async function sendGuestMail(
  hostId: string,
  messages: Mail[],
  log: (msg: string) => void,
): Promise<GuestSendResult> {
  const id = await hostIdentity(hostId);
  const guard: MailGuard = { testMode: id.testMode, safeTo: id.safeTo };
  const { send, suppressed } = splitGuestMail(guard, messages);
  if (suppressed.length) log(`test mode: ${suppressed.length} guest email(s) not sent`);
  const result: SendResult = send.length
    ? await sendMail(send, log)
    : { delivered: 0, failed: 0, skipped: 0, failedRecipients: [], quotaExhausted: false };
  return { ...result, testSuppressed: suppressed.length, suppressedRecipients: suppressed.map((m) => m.to) };
}

/**
 * Admin-only routes: re-reads users.role from the DATABASE (never the JWT,
 * which may be up to 15 minutes stale), and refuses a session inside a test
 * host even though its owner is an admin.
 */
export async function requireRealAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.userId) return reply.code(401).send({ error: "not_authenticated" });
  if (!(await adminStanding(req.userId)).realAdmin) return reply.code(403).send({ error: "admin_role_required" });
}

/**
 * The caller's admin standing, read from the DATABASE: a real admin (role
 * admin, not a test host), or a test host whose owner is still a real admin.
 * The one lookup behind requireRealAdmin and admin-only feature gates
 * (e.g. VIDEO_INVITES=admins).
 */
export async function adminStanding(userId: string): Promise<{ realAdmin: boolean; adminTestHost: boolean }> {
  const [u] = await db
    .select({ role: users.role, testOwnerId: users.testOwnerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { realAdmin: false, adminTestHost: false };
  if (!u.testOwnerId) return { realAdmin: u.role === "admin", adminTestHost: false };
  const [owner] = await db
    .select({ role: users.role, testOwnerId: users.testOwnerId })
    .from(users)
    .where(eq(users.id, u.testOwnerId))
    .limit(1);
  return { realAdmin: false, adminTestHost: !!owner && owner.role === "admin" && !owner.testOwnerId };
}
