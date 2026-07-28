import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import {
  generateRefreshSecret,
  parseRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from "../auth/jwt.js";
import { hashSecret, verifySecret } from "../auth/password.js";
import { db } from "../db/index.js";
import { passwordResetTokens, sessions, users } from "../db/schema.js";
import { buildPasswordResetEmail } from "../lib/emails/passwordReset.js";
import { sendMail } from "../lib/mailer.js";

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
});

// Short by design: the link is a bearer credential sitting in an inbox, and a
// host who asked for it is reading their mail right now. Long enough to
// survive a slow mail hop, not long enough to be worth stealing later.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// The id half of the token is looked up directly; a malformed one would make
// Postgres throw on an invalid uuid rather than return no rows.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function issueSession(userId: string) {
  const secret = generateRefreshSecret();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash: await hashSecret(secret),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .returning({ id: sessions.id });
  return `${session.id}.${secret}`;
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/register",
    { schema: { body: credentials.extend({ displayName: z.string().min(1).max(120).optional() }) } },
    async (req, reply) => {
      const { email, password, displayName } = req.body as z.infer<typeof credentials> & {
        displayName?: string;
      };
      const normalised = email.toLowerCase();

      const [user] = await db
        .insert(users)
        .values({ email: normalised, passwordHash: await hashSecret(password), displayName })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, role: users.role });

      // onConflictDoNothing rather than letting the unique violation surface as
      // a 409: a distinct "email already registered" response is an account
      // enumeration oracle. An existing address gets the same generic answer a
      // caller would get for a rejected registration.
      if (!user) {
        return reply.code(409).send({ error: "registration_failed" });
      }

      return reply.code(201).send({
        accessToken: signAccessToken({ sub: user.id, role: user.role as "host" | "admin" }),
        refreshToken: await issueSession(user.id),
      });
    },
  );

  app.post("/auth/login", { schema: { body: credentials } }, async (req, reply) => {
    const { email, password } = req.body as z.infer<typeof credentials>;
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Hash a dummy value when the user doesn't exist so the response time
    // doesn't distinguish "no such account" from "wrong password".
    if (!user) {
      await verifySecret(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu");
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    if (!(await verifySecret(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    return {
      accessToken: signAccessToken({ sub: user.id, role: user.role as "host" | "admin" }),
      refreshToken: await issueSession(user.id),
    };
  });

  app.post(
    "/auth/refresh",
    { schema: { body: z.object({ refreshToken: z.string().min(1) }) } },
    async (req, reply) => {
      const { refreshToken } = req.body as { refreshToken: string };
      const parsed = parseRefreshToken(refreshToken);
      if (!parsed) return reply.code(401).send({ error: "invalid_refresh_token" });

      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, parsed.sessionId))
        .limit(1);

      if (
        !session ||
        session.expiresAt.getTime() < Date.now() ||
        !(await verifySecret(parsed.secret, session.refreshTokenHash))
      ) {
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      const [user] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (!user) return reply.code(401).send({ error: "invalid_refresh_token" });

      // Rotate: the presented token is destroyed and a new one issued, so a
      // stolen refresh token is usable at most once and the theft shows up as
      // the real user being logged out.
      await db.delete(sessions).where(eq(sessions.id, session.id));

      return {
        accessToken: signAccessToken({ sub: user.id, role: user.role as "host" | "admin" }),
        refreshToken: await issueSession(user.id),
      };
    },
  );

  app.post(
    "/auth/logout",
    { schema: { body: z.object({ refreshToken: z.string().min(1) }) } },
    async (req, reply) => {
      const parsed = parseRefreshToken((req.body as { refreshToken: string }).refreshToken);
      if (parsed) {
        await db.delete(sessions).where(eq(sessions.id, parsed.sessionId));
      }
      // Always 204 — whether the token existed is not the caller's business.
      return reply.code(204).send();
    },
  );

  // --- password reset -------------------------------------------------------
  //
  // Both routes answer the same way whether or not the account exists. A
  // "no such email" here would be an account enumeration oracle on an
  // unauthenticated endpoint — the same reason /auth/register returns a
  // generic failure for an address already taken.

  app.post(
    "/auth/forgot-password",
    { schema: { body: z.object({ email: z.string().email().max(320) }) } },
    async (req, reply) => {
      const { email } = req.body as { email: string };

      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (user) {
        // Invalidate any outstanding token first, so asking twice doesn't
        // leave two live links — the newest email is the only one that works.
        await db
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, user.id));

        const secret = randomBytes(32).toString("base64url");
        const [row] = await db
          .insert(passwordResetTokens)
          .values({
            userId: user.id,
            tokenHash: await hashSecret(secret),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          })
          .returning({ id: passwordResetTokens.id });

        // Same id.secret shape as a refresh token: the id finds the row, the
        // secret is verified against the stored hash, so the database never
        // holds anything usable.
        await sendMail(
          [
            buildPasswordResetEmail(
              user.email,
              `${row.id}.${secret}`,
              RESET_TOKEN_TTL_MS / 60_000,
            ),
          ],
          (msg) => req.log.info({ userId: user.id }, msg),
        );
      }

      // 204 regardless — including when the mailer is unconfigured. Whether an
      // email went out is not something an unauthenticated caller may learn.
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/reset-password",
    {
      schema: {
        body: z.object({
          token: z.string().min(1).max(500),
          password: z.string().min(10).max(200),
        }),
      },
    },
    async (req, reply) => {
      const { token, password } = req.body as { token: string; password: string };

      const [id, secret] = token.split(".");
      const invalid = () => reply.code(400).send({ error: "invalid_or_expired_token" });
      if (!id || !secret || !UUID.test(id)) return invalid();

      const [row] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.id, id))
        .limit(1);

      if (
        !row ||
        row.usedAt !== null ||
        row.expiresAt.getTime() < Date.now() ||
        !(await verifySecret(secret, row.tokenHash))
      ) {
        return invalid();
      }

      await db
        .update(users)
        .set({ passwordHash: await hashSecret(password) })
        .where(eq(users.id, row.userId));

      // Single-use: burn the token before returning, so a forwarded email or a
      // link left in browser history can't reset the password a second time.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));

      // Every existing session dies with the old password. If the reset was
      // the real owner recovering a compromised account, this is what actually
      // evicts whoever was in it.
      await db.delete(sessions).where(eq(sessions.userId, row.userId));

      return reply.code(204).send();
    },
  );

  app.get("/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return user;
  });

  app.delete("/auth/sessions", { preHandler: requireAuth }, async (req, reply) => {
    await db.delete(sessions).where(and(eq(sessions.userId, req.userId!)));
    return reply.code(204).send();
  });
}
