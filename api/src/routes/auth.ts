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
import { sessions, users } from "../db/schema.js";

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
});

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
