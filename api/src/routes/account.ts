import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { verifySecret } from "../auth/password.js";
import { db } from "../db/index.js";
import { eventTemplates, events, passwordResetTokens, sessions, users } from "../db/schema.js";
import { rateLimiter } from "../lib/rateLimit.js";
import { deleteEventObjects } from "../plugins/r2.js";

// Self-serve account deletion (the web's /delete-account page).
//
// What goes, and how:
//   - users row → sessions, password_reset_tokens, host templates
//     (event_templates.created_by) and events all reference it ON DELETE
//     CASCADE;
//   - events → guests, rsvp_log, guestbook_posts, announcements and
//     event_views all reference events ON DELETE CASCADE.
// The deletes below are nevertheless spelled out child-first inside one
// transaction, so the route does not silently start leaving rows behind if a
// future FK is added without a cascade — it fails loudly instead, and rolls
// back whole.
//
// R2 objects are removed after the commit and best-effort: the rows are the
// thing that must be atomic, and a bucket hiccup must not resurrect an account
// the host has asked us to delete. A leftover object is unreachable anyway —
// every read is a presigned URL minted for an event that no longer exists.

// Per account, so a stolen access token cannot be used to brute-force the
// password confirmation.
const attempts = rateLimiter(5, 15 * 60_000);

export async function accountRoutes(app: FastifyInstance) {
  app.post(
    "/me/delete",
    {
      preHandler: requireAuth,
      schema: { body: z.object({ password: z.string().min(1).max(200) }) },
    },
    async (req, reply) => {
      const me = req.userId!;
      const { password } = req.body as { password: string };

      if (!attempts(me)) return reply.code(429).send({ error: "rate_limited" });

      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, me))
        .limit(1);
      // The access token outlives the account by up to 15 minutes.
      if (!user) return reply.code(401).send({ error: "not_authenticated" });

      if (!(await verifySecret(password, user.passwordHash))) {
        return reply.code(403).send({ error: "wrong_password" });
      }

      const eventIds = await db.transaction(async (tx) => {
        const owned = await tx
          .delete(events)
          .where(eq(events.hostId, me))
          .returning({ id: events.id });
        await tx.delete(eventTemplates).where(eq(eventTemplates.createdBy, me));
        await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, me));
        await tx.delete(sessions).where(eq(sessions.userId, me));
        await tx.delete(users).where(eq(users.id, me));
        return owned.map((e) => e.id);
      });

      req.log.info({ userId: me, events: eventIds.length }, "account deleted");

      // After the commit, and not awaited by the response: a host with many
      // events should not sit watching a spinner while the bucket is swept.
      void (async () => {
        let objects = 0;
        for (const id of eventIds) {
          try {
            objects += await deleteEventObjects(id);
          } catch (err) {
            req.log.warn({ eventId: id, err: String(err) }, "R2 cleanup failed after account deletion");
          }
        }
        req.log.info({ userId: me, objects }, "R2 cleanup after account deletion finished");
      })();

      return reply.code(204).send();
    },
  );
}
