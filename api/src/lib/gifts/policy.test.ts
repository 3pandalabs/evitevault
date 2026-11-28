import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountStatus,
  amountProblem,
  canGiftTransition,
  cleanEmail,
  cleanSuggestedAmounts,
  cleanText,
  CONNECT_EVENT_TYPES,
  DEFAULT_FEES,
  DEFAULT_LIMITS,
  decideGiftPaid,
  feeConfigFrom,
  giftBreakdown,
  giftStripeMode,
  limitsFrom,
  overDailyCap,
  overEventCap,
  PLATFORM_EVENT_TYPES,
  routeGiftEvent,
  stripeFeeOn,
} from "./policy.js";
import type { GiftStatus, GiftWebhookAction } from "./policy.js";
import { accountsApi, expressAccountForm, expressAccountV2Body, giftCheckoutForm, payoutHoldForm } from "./stripe.js";
import { buildGiftReceiptEmail, buildGiftReceivedEmail } from "../emails/gift.js";

test("fee math: host gets exactly the gift, platform nets exactly its cut", () => {
  for (const gift of [500, 501, 999, 1000, 1234, 2500, 3333, 5000, 7777, 10_000, 25_000, 49_999, 50_000]) {
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

test("caps: min $5, max $500 per gift, configurable", () => {
  const l = DEFAULT_LIMITS;
  assert.equal(amountProblem(499, l), "amount_too_small");
  assert.equal(amountProblem(500, l), null);
  assert.equal(amountProblem(50_000, l), null);
  assert.equal(amountProblem(50_001, l), "amount_too_large");
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
    live: false,
    guestEmail: null,
  });
  const withEmail = routeGiftEvent({
    ...session(meta, { customer_details: { email: "g@example.com" } }),
    livemode: true,
  });
  assert.equal(withEmail.kind === "gift_paid" && withEmail.live, true);
  assert.equal(withEmail.kind === "gift_paid" && withEmail.guestEmail, "g@example.com");
  assert.equal(
    routeGiftEvent({ ...session(meta), type: "checkout.session.async_payment_succeeded" }).kind,
    "gift_paid",
    "delayed payment methods pay too",
  );
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
  assert.equal(
    routeGiftEvent({ type: "charge.refunded", data: { object: { payment_intent: "pi_1", refunded: false } } }).kind,
    "none",
    "a partial refund leaves the gift paid",
  );
  assert.deepEqual(routeGiftEvent({ type: "charge.refunded", data: { object: { payment_intent: "pi_1", refunded: true } } }), {
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

test("per-event all-time cap: $5,000 by default, configurable", () => {
  const l = DEFAULT_LIMITS;
  assert.equal(l.eventTotalCapCents, 500_000);
  assert.equal(overEventCap(450_000, 50_000, l), false);
  assert.equal(overEventCap(450_001, 50_000, l), true);
  assert.equal(limitsFrom({ GIFT_EVENT_CAP_CENTS: "100000" }).eventTotalCapCents, 100_000);
  assert.equal(limitsFrom({ GIFT_EVENT_CAP_CENTS: "nope" }).eventTotalCapCents, 500_000);
});

test("Stripe mode: TEST unless GIFTS_STRIPE_MODE=live, and test-mode hosts are always TEST", () => {
  assert.equal(giftStripeMode(undefined, false), "test", "unset = test");
  assert.equal(giftStripeMode("", false), "test");
  assert.equal(giftStripeMode("on", false), "test");
  assert.equal(giftStripeMode("LIVE", false), "live");
  assert.equal(giftStripeMode("live", true), "test", "admin testing as host never goes live");
});

test("guest email from Stripe: plausible addresses only", () => {
  assert.equal(cleanEmail(" Guest@Example.com "), "guest@example.com");
  assert.equal(cleanEmail(null), null);
  assert.equal(cleanEmail("not an email"), null);
  assert.equal(cleanEmail("x@test.rsvpvault.invalid"), null);
});

// Webhook idempotency over the pure rules: a simulated gifts table applies
// routed events the way webhook.ts does (decideGiftPaid, then an UPDATE
// conditional on the status it leaves). Duplicates, retries and out-of-order
// deliveries must converge, and mail goes out exactly once.
type Row = { id: string; status: GiftStatus; totalCents: number; testMode: boolean; pi: string | null };

function simulate(rows: Row[], actions: GiftWebhookAction[]): { mails: number; outcomes: string[] } {
  let mails = 0;
  const outcomes: string[] = [];
  const move = (pi: string, from: GiftStatus[], to: GiftStatus) => {
    for (const r of rows) if (r.pi === pi && from.includes(r.status)) r.status = to;
  };
  for (const a of actions) {
    if (a.kind === "gift_paid") {
      const r = rows.find((x) => x.id === a.giftId);
      if (!r) {
        outcomes.push("unknown");
        continue;
      }
      const d = decideGiftPaid(r, a);
      outcomes.push(d);
      if (d === "apply" && r.status === "pending") {
        r.status = "paid";
        r.pi = a.paymentIntent;
        mails += 2; // host + guest, only for the UPDATE that moved the row
      }
    } else if (a.kind === "gift_expired") {
      const r = rows.find((x) => x.id === a.giftId);
      if (r && r.status === "pending") r.status = "expired";
      outcomes.push("expired");
    } else if (a.kind === "gift_refunded") move(a.paymentIntent, ["paid", "disputed"], "refunded");
    else if (a.kind === "gift_disputed") move(a.paymentIntent, ["paid"], "disputed");
    else if (a.kind === "gift_dispute_closed") move(a.paymentIntent, ["disputed"], a.won ? "paid" : "dispute_lost");
  }
  return { mails, outcomes };
}

const giftMeta = { app: "rsvpvault", kind: "gift", gift_id: "g1" };
const completed = routeGiftEvent(session(giftMeta, { amount_total: 5258 }));
const asyncOk = routeGiftEvent({ ...session(giftMeta, { amount_total: 5258 }), type: "checkout.session.async_payment_succeeded" });
const expiredEv = routeGiftEvent({ ...session(giftMeta), type: "checkout.session.expired" });
const disputedEv = routeGiftEvent({ type: "charge.dispute.created", data: { object: { payment_intent: "pi_1" } } });
const wonEv = routeGiftEvent({ type: "charge.dispute.closed", data: { object: { payment_intent: "pi_1", status: "won" } } });
const fresh = (): Row[] => [{ id: "g1", status: "pending", totalCents: 5258, testMode: true, pi: null }];

test("idempotency: the same paid event repeated + async_succeeded = paid once, mail once", () => {
  const rows = fresh();
  const r = simulate(rows, [completed, completed, asyncOk, completed]);
  assert.equal(rows[0].status, "paid");
  assert.equal(r.mails, 2);
  assert.deepEqual(r.outcomes, ["apply", "already", "already", "already"]);
});

test("idempotency: expired after paid changes nothing; paid after expired changes nothing", () => {
  const a = fresh();
  simulate(a, [completed, expiredEv]);
  assert.equal(a[0].status, "paid");
  const b = fresh();
  const r = simulate(b, [expiredEv, completed]);
  assert.equal(b[0].status, "expired");
  assert.equal(r.mails, 0);
});

test("idempotency: a replayed checkout during a dispute never clears it", () => {
  const rows = fresh();
  simulate(rows, [completed, disputedEv, disputedEv, completed]);
  assert.equal(rows[0].status, "disputed");
  simulate(rows, [wonEv, wonEv]);
  assert.equal(rows[0].status, "paid");
});

test("a test-mode event can never pay a live gift (and the reverse)", () => {
  const live: Row[] = [{ id: "g1", status: "pending", totalCents: 5258, testMode: false, pi: null }];
  const r = simulate(live, [completed]); // livemode unset = test
  assert.deepEqual(r.outcomes, ["mode_mismatch"]);
  assert.equal(live[0].status, "pending");
  const liveEvent = routeGiftEvent({ ...session(giftMeta, { amount_total: 5258 }), livemode: true });
  assert.deepEqual(simulate(fresh(), [liveEvent]).outcomes, ["mode_mismatch"]);
});

test("amount mismatch never pays", () => {
  const rows = fresh();
  const r = simulate(rows, [routeGiftEvent(session(giftMeta, { amount_total: 100 }))]);
  assert.deepEqual(r.outcomes, ["amount_mismatch"]);
  assert.equal(rows[0].status, "pending");
});

test("gift emails: host sees amount + message, guest sees the breakdown; text is escaped", () => {
  const host = buildGiftReceivedEmail({
    to: "host@example.com",
    origin: "https://rsvpvault.3pandalabs.com",
    eventId: "e1",
    eventTitle: "Asha's <wedding>",
    guestName: "Ravi",
    guestMessage: "Congrats! <script>",
    amountCents: 5000,
    testMode: false,
  });
  assert.match(host.subject, /You got a \$50\.00 gift/);
  assert.ok(host.html.includes("&lt;script&gt;") && !host.html.includes("<script>"));
  assert.ok(host.text.includes("Congrats!"));
  assert.ok(host.html.includes("by 3PandaLabs"));
  const b = giftBreakdown(5000);
  const guest = buildGiftReceiptEmail({
    to: "g@example.com",
    origin: "https://rsvpvault.3pandalabs.com",
    slug: "s1",
    eventTitle: "Party",
    hostName: "Asha",
    amountCents: b.giftCents,
    platformFeeCents: b.platformCents,
    cardFeeCents: b.cardFeeCents,
    totalCents: b.totalCents,
    testMode: true,
  });
  assert.ok(guest.subject.startsWith("[Test] "));
  assert.ok(guest.text.includes("Gift to Asha: $50.00"));
  assert.ok(guest.text.includes("Card processing and service fee: $2.58"));
  assert.ok(guest.text.includes("Total paid: $52.58"));
  assert.ok(guest.text.includes("no real money"));
});

test("Accounts v2 by default: recipient + stripe_transfers, Express dashboard, platform liable; 7-day hold via v1", () => {
  assert.equal(accountsApi(undefined), "v2");
  assert.equal(accountsApi("v1"), "v1");
  assert.equal(accountsApi("anything"), "v2");
  const b = expressAccountV2Body("u1") as {
    dashboard: string;
    identity: { country: string };
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: boolean } } } } };
    defaults: { responsibilities: { fees_collector: string; losses_collector: string } };
    metadata: Record<string, string>;
  };
  assert.equal(b.dashboard, "express");
  assert.equal(b.identity.country, "us");
  assert.equal(b.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
  assert.deepEqual(b.defaults.responsibilities, { fees_collector: "application", losses_collector: "application" });
  assert.equal(b.metadata.app, "rsvpvault");
  assert.equal(payoutHoldForm().get("settings[payouts][schedule][delay_days]"), "7");
});

test("readiness: a v2 recipient (transfers active, no card_payments) is ready once payouts are on", () => {
  assert.equal(accountStatus({ payouts_enabled: true, charges_enabled: false, capabilities: { transfers: "active" } }), "ready");
  assert.equal(accountStatus({ payouts_enabled: false, capabilities: { transfers: "active" }, details_submitted: true }), "pending");
  assert.equal(accountStatus({ payouts_enabled: true, capabilities: { transfers: "pending" }, details_submitted: true }), "pending");
});
