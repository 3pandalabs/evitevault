import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { events, gifts, type Gift } from "../../db/schema.js";
import { saveAccountStatus } from "./access.js";
import { env } from "../../env.js";
import { buildGiftReceiptEmail, buildGiftReceivedEmail } from "../emails/gift.js";
import { sendMail, type Mail } from "../mailer.js";
import { hostIdentity } from "../testMode/index.js";
import { cleanEmail, decideGiftPaid, type GiftStatus, type GiftWebhookAction } from "./policy.js";

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
      const decision = decideGiftPaid(
        { status: g.status as GiftStatus, totalCents: g.totalCents, testMode: g.testMode },
        action,
      );
      if (decision === "already") return `already ${g.status}`;
      if (decision === "mode_mismatch") {
        // A test-mode event naming a live gift (or the reverse): never pays it.
        log.error({ giftId: g.id, live: action.live, testMode: g.testMode }, "gift stripe mode mismatch");
        return "mode mismatch";
      }
      if (decision === "amount_mismatch") {
        log.error({ giftId: g.id, amountTotal: action.amountTotal, expected: g.totalCents }, "gift amount mismatch");
        return "amount mismatch";
      }
      const updated = await db
        .update(gifts)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripeSessionId: action.sessionId,
          stripePaymentIntent: action.paymentIntent,
          guestEmail: cleanEmail(action.guestEmail),
          updatedAt: new Date(),
        })
        .where(and(eq(gifts.id, g.id), eq(gifts.status, "pending")))
        .returning();
      // Only the delivery whose UPDATE moved the row sends mail: a retried or
      // duplicate event (completed + async_payment_succeeded) changes nothing
      // and sends nothing.
      if (updated[0]) await sendGiftEmails(updated[0], log);
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

type Log = { info: (o: object, m: string) => void; error: (o: object, m: string) => void };

/**
 * "You got a gift" to the host and a receipt to the guest. Fire-and-forget
 * through the shared gateway: a mail failure only logs, the gift stays paid.
 * The host address comes from hostIdentity().safeTo, so a test host's mail
 * goes to the admin who owns it (never a .invalid address).
 */
async function sendGiftEmails(g: Gift, log: Log): Promise<void> {
  try {
    const [event] = await db
      .select({ id: events.id, slug: events.slug, title: events.title, hostName: events.hostDisplayName })
      .from(events)
      .where(eq(events.id, g.eventId))
      .limit(1);
    if (!event) return;
    const hostTo = (await hostIdentity(g.hostId)).safeTo[0];
    const mail: Mail[] = [];
    if (hostTo) {
      mail.push(
        buildGiftReceivedEmail({
          to: hostTo,
          origin: env.WEB_ORIGIN,
          eventId: event.id,
          eventTitle: event.title,
          guestName: g.guestName,
          guestMessage: g.guestMessage,
          amountCents: g.amountCents,
          testMode: g.testMode,
        }),
      );
    }
    if (g.guestEmail) {
      mail.push(
        buildGiftReceiptEmail({
          to: g.guestEmail,
          origin: env.WEB_ORIGIN,
          slug: event.slug,
          eventTitle: event.title,
          hostName: event.hostName,
          amountCents: g.amountCents,
          platformFeeCents: g.platformFeeCents,
          cardFeeCents: g.cardFeeCents,
          totalCents: g.totalCents,
          testMode: g.testMode,
        }),
      );
    }
    if (mail.length) await sendMail(mail, (m) => log.info({ giftId: g.id }, m));
  } catch (err) {
    log.error({ err, giftId: g.id }, "gift emails failed");
  }
}
