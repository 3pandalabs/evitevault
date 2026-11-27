import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountStatus,
  amountProblem,
  canGiftTransition,
  cleanSuggestedAmounts,
  cleanText,
  CONNECT_EVENT_TYPES,
  DEFAULT_FEES,
  DEFAULT_LIMITS,
  feeConfigFrom,
  giftBreakdown,
  limitsFrom,
  overDailyCap,
  PLATFORM_EVENT_TYPES,
  routeGiftEvent,
  stripeFeeOn,
} from "./policy.js";
import { expressAccountForm, giftCheckoutForm } from "./stripe.js";

test("fee math: host gets exactly the gift, platform nets exactly its cut", () => {
  for (const gift of [500, 1000, 2500, 5000, 10_000, 25_000, 1234]) {
    const b = giftBreakdown(gift);
    assert.equal(b.giftCents, gift);
    assert.equal(b.totalCents, b.giftCents + b.platformCents + b.cardFeeCents);
    assert.equal(b.applicationFeeCents, b.platformCents + b.cardFeeCents);
    // The host receives total - application fee = the gift.
    assert.equal(b.totalCents - b.applicationFeeCents, gift);
    // The platform's net after Stripe takes its fee from the platform is >= its cut,
    // and never more than a cent or so above it (rounding).
    const platformNet = b.applicationFeeCents - stripeFeeOn(b.totalCents);
    assert.ok(platformNet >= b.platformCents, `gift ${gift}: net ${platformNet} < cut ${b.platformCents}`);
    assert.ok(platformNet - b.platformCents <= 2, `gift ${gift}: overshoot ${platformNet - b.platformCents}`);
  }
});

test("fee math: a $50 gift", () => {
  const b = giftBreakdown(5000);
  assert.equal(b.platformCents, 75); // 1.5%
  assert.equal(b.totalCents, 5258); // (5000 + 75 + 30) / 0.971 = 5257.47, rounded up
  assert.equal(b.cardFeeCents, 183);
});

test("fee config from env, with sane fallbacks", () => {
  assert.deepEqual(feeConfigFrom({}), DEFAULT_FEES);
  assert.equal(feeConfigFrom({ GIFT_PLATFORM_FEE_BPS: "200" }).platformFeeBps, 200);
  assert.equal(feeConfigFrom({ GIFT_PLATFORM_FEE_BPS: "-1" }).platformFeeBps, 150);
  assert.equal(feeConfigFrom({ GIFT_PLATFORM_FEE_BPS: "abc" }).platformFeeBps, 150);
  assert.equal(giftBreakdown(5000, { ...DEFAULT_FEES, platformFeeBps: 0 }).platformCents, 0);
});

test("caps: min $5, max $250 per gift, configurable", () => {
  const l = DEFAULT_LIMITS;
  assert.equal(amountProblem(499, l), "amount_too_small");
  assert.equal(amountProblem(500, l), null);
  assert.equal(amountProblem(25_000, l), null);
  assert.equal(amountProblem(25_001, l), "amount_too_large");
  assert.equal(amountProblem(10.5, l), "amount_not_whole_cents");
  assert.equal(limitsFrom({ GIFT_MAX_CENTS: "10000" }).maxCents, 10_000);
  assert.equal(limitsFrom({ GIFT_MIN_CENTS: "2000", GIFT_MAX_CENTS: "1000" }).maxCents, 2000, "max never below min");
});

test("per-event daily cap", () => {
  const l = DEFAULT_LIMITS; // $2,000
  assert.equal(overDailyCap(190_000, 10_000, l), false);
  assert.equal(overDailyCap(190_001, 10_000, l), true);
});

test("suggested amounts: whole dollars inside the limits, unique, sorted, max 4", () => {
  assert.deepEqual(cleanSuggestedAmounts([5000, 2500, 2500, 199, 2550, 30_000, 10_000, 1000, 500], DEFAULT_LIMITS), [500, 1000, 2500, 5000]);
});

test("free text is cleaned and capped", () => {
  assert.equal(cleanText("  hi\u0000 there  ", 50), "hi there");
  assert.equal(cleanText("   ", 50), null);
  assert.equal(cleanText("x".repeat(100), 10), "x".repeat(10));
});

test("connected account status", () => {
  assert.equal(accountStatus(null), "none");
  assert.equal(accountStatus({ charges_enabled: true, payouts_enabled: true }), "ready");
  assert.equal(accountStatus({ details_submitted: false }), "needs_info");
  assert.equal(accountStatus({ details_submitted: true, requirements: { currently_due: ["external_account"] } }), "needs_info");
  assert.equal(accountStatus({ details_submitted: true, requirements: { currently_due: [] } }), "pending");
});

test("gift lifecycle", () => {
  assert.ok(canGiftTransition("pending", "paid"));
  assert.ok(canGiftTransition("pending", "expired"));
  assert.ok(!canGiftTransition("expired", "paid"));
  assert.ok(canGiftTransition("paid", "disputed"));
  assert.ok(canGiftTransition("disputed", "paid"), "dispute won");
  assert.ok(canGiftTransition("disputed", "dispute_lost"));
  assert.ok(!canGiftTransition("paid", "paid"), "a repeated webhook is a no-op");
});

const session = (meta: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", metadata: meta, payment_status: "paid", payment_intent: "pi_1", amount_total: 5257, ...extra } },
});

test("webhook routing: gifts, Connect accounts, refunds, disputes; everything else ignored", () => {
  const meta = { app: "rsvpvault", kind: "gift", gift_id: "g1" };
  assert.deepEqual(routeGiftEvent(session(meta)), {
    kind: "gift_paid",
    giftId: "g1",
    sessionId: "cs_1",
    paymentIntent: "pi_1",
    amountTotal: 5257,
  });
  assert.equal(routeGiftEvent(session({ ...meta, app: "advault" })).kind, "none");
  assert.equal(routeGiftEvent(session({ app: "rsvpvault", kind: "video_invite", order_id: "o1" })).kind, "none", "video invites fall through");
  assert.equal(routeGiftEvent(session(meta, { payment_status: "unpaid" })).kind, "none");
  assert.deepEqual(routeGiftEvent({ ...session(meta), type: "checkout.session.expired" }), { kind: "gift_expired", giftId: "g1" });

  assert.deepEqual(
    routeGiftEvent({
      type: "account.updated",
      livemode: true,
      data: { object: { id: "acct_1", object: "account", charges_enabled: true, payouts_enabled: true } },
    }),
    { kind: "account_updated", accountId: "acct_1", live: true, status: "ready" },
  );
  assert.deepEqual(routeGiftEvent({ type: "charge.refunded", data: { object: { payment_intent: "pi_1" } } }), {
    kind: "gift_refunded",
    paymentIntent: "pi_1",
  });
  assert.deepEqual(routeGiftEvent({ type: "charge.dispute.created", data: { object: { payment_intent: "pi_1" } } }), {
    kind: "gift_disputed",
    paymentIntent: "pi_1",
  });
  assert.deepEqual(
    routeGiftEvent({ type: "charge.dispute.closed", data: { object: { payment_intent: "pi_1", status: "lost" } } }),
    { kind: "gift_dispute_closed", paymentIntent: "pi_1", won: false },
  );
  assert.equal(routeGiftEvent({ type: "invoice.paid", data: { object: { id: "in_1" } } }).kind, "none");
  assert.ok(PLATFORM_EVENT_TYPES.includes("charge.dispute.created"));
  assert.deepEqual([...CONNECT_EVENT_TYPES], ["account.updated"]);
});

test("Express account: US, card_payments + transfers, 7-day payout delay", () => {
  const f = expressAccountForm("u1");
  assert.equal(f.get("type"), "express");
  assert.equal(f.get("country"), "US");
  assert.equal(f.get("capabilities[card_payments][requested]"), "true");
  assert.equal(f.get("capabilities[transfers][requested]"), "true");
  assert.equal(f.get("settings[payouts][schedule][delay_days]"), "7");
});

test("gift checkout: destination charge to the host, our application fee, tagged rsvpvault gift", () => {
  const b = giftBreakdown(5000);
  const f = giftCheckoutForm({
    giftId: "g1",
    eventId: "e1",
    eventTitle: "Maya's Birthday",
    destination: "acct_host",
    giftCents: b.giftCents,
    feesCents: b.totalCents - b.giftCents,
    applicationFeeCents: b.applicationFeeCents,
    successUrl: "https://x/s",
    cancelUrl: "https://x/c",
    testMode: false,
  });
  assert.equal(f.get("payment_intent_data[transfer_data][destination]"), "acct_host");
  assert.equal(f.get("payment_intent_data[application_fee_amount]"), String(b.applicationFeeCents));
  assert.equal(
    Number(f.get("line_items[0][price_data][unit_amount]")) + Number(f.get("line_items[1][price_data][unit_amount]")),
    b.totalCents,
    "the guest sees the same total",
  );
  assert.equal(f.get("metadata[app]"), "rsvpvault");
  assert.equal(f.get("metadata[kind]"), "gift");
  assert.equal(f.get("payment_intent_data[metadata][gift_id]"), "g1");
  assert.equal(f.get("metadata[test_mode]"), null);
  assert.equal(f.get("customer_email"), null, "guests are anonymous to us");
});
