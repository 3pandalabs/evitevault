import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { gifts } from "../../db/schema.js";
import { saveAccountStatus } from "./access.js";
import { canGiftTransition, type GiftStatus, type GiftWebhookAction } from "./policy.js";

// Applies one routed Stripe event to gifts / connected accounts. Idempotent:
// Stripe retries, and every status move is conditional on the status it
// leaves. Returns a short outcome for logs and the webhook response.

export async function applyGiftEvent(
  action: GiftWebhookAction,
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void },
): Promise<string> {
  switch (action.kind) {
    case "none":
      return "none";

    case "account_updated":
      await saveAccountStatus(action.accountId, action.live, action.status);
      return `account ${action.status}`;

    case "gift_paid": {
      const [g] = await db.select().from(gifts).where(eq(gifts.id, action.giftId)).limit(1);
      if (!g) return "unknown gift";
      if (!canGiftTransition(g.status as GiftStatus, "paid")) return `already ${g.status}`;
      if (action.amountTotal !== null && action.amountTotal !== g.totalCents) {
        log.error({ giftId: g.id, amountTotal: action.amountTotal, expected: g.totalCents }, "gift amount mismatch");
        return "amount mismatch";
      }
      await db
        .update(gifts)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripeSessionId: action.sessionId,
          stripePaymentIntent: action.paymentIntent,
          updatedAt: new Date(),
        })
        .where(and(eq(gifts.id, g.id), eq(gifts.status, "pending")));
      return "paid";
    }

    case "gift_expired":
      await db
        .update(gifts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(gifts.id, action.giftId), eq(gifts.status, "pending")));
      return "expired";

    case "gift_refunded":
      await db
        .update(gifts)
        .set({ status: "refunded", refundedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(gifts.stripePaymentIntent, action.paymentIntent), inArray(gifts.status, ["paid", "disputed"])));
      log.info({ paymentIntent: action.paymentIntent }, "gift refunded");
      return "refunded";

    case "gift_disputed": {
      const rows = await db
        .update(gifts)
        .set({ status: "disputed", disputedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(gifts.stripePaymentIntent, action.paymentIntent), eq(gifts.status, "paid")))
        .returning({ id: gifts.id, eventId: gifts.eventId, hostId: gifts.hostId, amountCents: gifts.amountCents });
      // Ops alert: the platform is liable. Counted in /metrics giftsDisputed.
      for (const r of rows) log.error({ ...r, paymentIntent: action.paymentIntent }, "GIFT DISPUTED: platform liable, recover from host");
      return "disputed";
    }

    case "gift_dispute_closed":
      await db
        .update(gifts)
        .set({ status: action.won ? "paid" : "dispute_lost", updatedAt: new Date() })
        .where(and(eq(gifts.stripePaymentIntent, action.paymentIntent), eq(gifts.status, "disputed")));
      return action.won ? "dispute won" : "dispute lost";
  }
}
