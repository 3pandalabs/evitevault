import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { events, gifts, users } from "../db/schema.js";
import { env } from "../env.js";
import { giftsVisible, hostAccount } from "../lib/gifts/access.js";
import {
  accountStatus,
  cleanSuggestedAmounts,
  cleanText,
  feeConfigFrom,
  limitsFrom,
} from "../lib/gifts/policy.js";
import { createExpressAccount, expressLoginLink, onboardingLink, retrieveAccount } from "../lib/gifts/stripe.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { hostIdentity } from "../lib/testMode/index.js";

// Host side of cash gifts (lib/gifts/policy.ts has the rules). Behind
// CASH_GIFTS: off (or admins and the caller isn't a real admin / their test
// host) = every route 404, exactly as if the feature didn't exist.
//
// Stripe mode follows the host (lib/gifts/access.ts): live for real hosts,
// TEST for an admin testing as host or a test host. With no test key, test
// mode answers 409 gifts_test_unavailable: a test never makes a live account
// or a live charge.

export async function giftRoutes(app: FastifyInstance) {
  app.register(async (host) => {
    host.addHook("onRequest", requireAuth);
    host.addHook("onRequest", async (req, reply) => {
      if (!req.userId) return;
      if (!(await giftsVisible(req.userId))) return reply.code(404).send({ error: "not_found" });
    });

    // The host's connected account, refreshed from Stripe when one exists.
    host.get("/gifts/account", async (req, reply) => {
      const account = await hostAccount(req.userId!);
      if (!account.configured) {
        return reply.send({ ...account, status: "none", available: false, reason: account.mode === "test" ? "test_unavailable" : "not_configured" });
      }
      if (account.accountId) {
        try {
          const fresh = accountStatus(await retrieveAccount(account.mode, account.accountId));
          if (fresh !== account.status) {
            await db
              .update(users)
              .set(account.mode === "live" ? { stripeAccountStatus: fresh } : { stripeTestAccountStatus: fresh })
              .where(eq(users.id, req.userId!));
          }
          return { mode: account.mode, status: fresh, available: true };
        } catch (err) {
          req.log.warn({ err }, "stripe account refresh failed");
        }
      }
      return { mode: account.mode, status: account.status, available: true };
    });

    // Start or continue Stripe-hosted onboarding; returns the link to send the host to.
    host.post(
      "/gifts/account/onboard",
      { schema: { body: z.object({ eventId: z.string().uuid() }) } },
      async (req, reply) => {
        const { eventId } = req.body as { eventId: string };
        if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;
        const account = await hostAccount(req.userId!);
        if (!account.configured) {
          return reply.code(409).send({ error: account.mode === "test" ? "gifts_test_unavailable" : "gifts_unavailable" });
        }
        let accountId = account.accountId;
        if (!accountId) {
          // A test host's own address is .invalid: use its admin's (safeTo), like guest mail.
          const contactEmail = (await hostIdentity(req.userId!)).safeTo[0];
          if (!contactEmail) return reply.code(409).send({ error: "gifts_unavailable" });
          const created = await createExpressAccount(account.mode, req.userId!, contactEmail);
          accountId = created.id;
          await db
            .update(users)
            .set(
              account.mode === "live"
                ? { stripeAccountId: accountId, stripeAccountStatus: accountStatus(created) }
                : { stripeTestAccountId: accountId, stripeTestAccountStatus: accountStatus(created) },
            )
            .where(eq(users.id, req.userId!));
          req.log.info({ userId: req.userId, mode: account.mode }, "stripe express account created");
        }
        const back = `${env.WEB_ORIGIN}/dashboard/events/${eventId}`;
        const url = await onboardingLink(account.mode, accountId, `${back}?gifts=return`, `${back}?gifts=refresh`);
        return { url };
      },
    );

    // One-time link into the host's Stripe Express dashboard (payouts, tax forms).
    host.post("/gifts/account/dashboard", async (req, reply) => {
      const account = await hostAccount(req.userId!);
      if (!account.configured || !account.accountId) return reply.code(409).send({ error: "no_account" });
      return { url: await expressLoginLink(account.mode, account.accountId) };
    });

    // Settings + the gifts received for one event (never shown publicly).
    host.get(
      "/events/:eventId/gifts",
      { schema: { params: z.object({ eventId: z.string().uuid() }) } },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        const event = await loadOwnedEvent(eventId, req.userId!, reply);
        if (!event) return;
        const rows = await db
          .select({
            id: gifts.id,
            guestName: gifts.guestName,
            guestMessage: gifts.guestMessage,
            amountCents: gifts.amountCents,
            status: gifts.status,
            testMode: gifts.testMode,
            paidAt: gifts.paidAt,
          })
          .from(gifts)
          .where(and(eq(gifts.eventId, eventId), inArray(gifts.status, ["paid", "refunded", "disputed", "dispute_lost"])))
          .orderBy(desc(gifts.paidAt))
          .limit(500);
        const [totals] = await db
          .select({ received: sql<number>`coalesce(sum(${gifts.amountCents}) filter (where ${gifts.status} = 'paid'), 0)::int` })
          .from(gifts)
          .where(eq(gifts.eventId, eventId));
        const limits = limitsFrom(process.env);
        return {
          enabled: event.giftsEnabled,
          suggestedCents: (event.giftSuggestedCents as number[] | null) ?? [],
          message: event.giftMessage,
          limits,
          fees: feeConfigFrom(process.env),
          receivedCents: totals?.received ?? 0,
          gifts: rows,
        };
      },
    );

    host.patch(
      "/events/:eventId/gifts",
      {
        schema: {
          params: z.object({ eventId: z.string().uuid() }),
          body: z.object({
            enabled: z.boolean().optional(),
            suggestedCents: z.array(z.number().int()).max(10).optional(),
            message: z.string().max(1000).nullish(),
          }),
        },
      },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        const body = req.body as { enabled?: boolean; suggestedCents?: number[]; message?: string | null };
        const event = await loadOwnedEvent(eventId, req.userId!, reply);
        if (!event) return;
        if (body.enabled === true) {
          const account = await hostAccount(req.userId!);
          if (!account.configured) {
            return reply.code(409).send({ error: account.mode === "test" ? "gifts_test_unavailable" : "gifts_unavailable" });
          }
          if (account.status !== "ready") return reply.code(409).send({ error: "gifts_account_not_ready" });
        }
        const patch: Partial<typeof events.$inferInsert> = { updatedAt: new Date() };
        if (body.enabled !== undefined) patch.giftsEnabled = body.enabled;
        if (body.suggestedCents !== undefined) patch.giftSuggestedCents = cleanSuggestedAmounts(body.suggestedCents, limitsFrom(process.env));
        if (body.message !== undefined) patch.giftMessage = cleanText(body.message, 300);
        const [updated] = await db
          .update(events)
          .set(patch)
          .where(eq(events.id, eventId))
          .returning({
            enabled: events.giftsEnabled,
            suggestedCents: events.giftSuggestedCents,
            message: events.giftMessage,
          });
        return updated;
      },
    );
  });
}
