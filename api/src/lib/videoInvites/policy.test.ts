import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  afterFailure,
  canTransition,
  cleanScript,
  estimatedSeconds,
  hostView,
  isEnabled,
  isStale,
  MAX_SCRIPT_CHARS,
  priceCents,
  providerOrder,
  providersToTry,
  routeStripeEvent,
  scriptProblem,
  STALE_GENERATING_MS,
} from "./policy.js";
import { speakingPrompt } from "./google.js";
import { checkoutForm, verifyStripeSignature } from "./stripe.js";

test("feature flag is only 'on'", () => {
  assert.equal(isEnabled("on"), true);
  assert.equal(isEnabled(" ON "), true);
  assert.equal(isEnabled(""), false);
  assert.equal(isEnabled(undefined), false);
  assert.equal(isEnabled("true"), false);
});

test("prices default to $3 / $5 and take sane overrides only", () => {
  assert.equal(priceCents("simple", undefined), 300);
  assert.equal(priceCents("pro", undefined), 500);
  assert.equal(priceCents("simple", "400"), 400);
  assert.equal(priceCents("pro", "abc"), 500);
  assert.equal(priceCents("pro", "10"), 500); // below Stripe's 50-cent floor
  assert.equal(priceCents("pro", "4.5"), 500);
});

test("script is cleaned and capped", () => {
  assert.equal(cleanScript("  Hi\u0007 there [laughs]  friends\n\nsee you! "), "Hi there friends see you!");
  assert.equal(scriptProblem("short"), "script_too_short");
  assert.equal(scriptProblem("x".repeat(MAX_SCRIPT_CHARS + 1)), "script_too_long");
  assert.equal(scriptProblem("Join us at https://evil.example now please"), "script_has_link");
  assert.equal(scriptProblem("Join us for Maya's first birthday on Saturday!"), null);
  assert.ok(estimatedSeconds("x".repeat(MAX_SCRIPT_CHARS)) <= 15, "cap fits Omni's 15 s clip");
});

test("lifecycle transitions", () => {
  assert.ok(canTransition("pending_payment", "paid"));
  assert.ok(canTransition("pending_payment", "cancelled"));
  assert.ok(!canTransition("pending_payment", "generating"), "never generate unpaid");
  assert.ok(canTransition("paid", "generating"));
  assert.ok(canTransition("generating", "ready"));
  assert.ok(canTransition("generating", "paid"), "retry");
  assert.ok(canTransition("failed", "refunded"));
  assert.ok(!canTransition("ready", "paid"));
  assert.ok(!canTransition("paid", "paid"), "a repeated webhook is a no-op");
});

test("failure retries once, then flags a refund", () => {
  assert.deepEqual(afterFailure(1), { status: "paid", refundNeeded: false });
  assert.deepEqual(afterFailure(2), { status: "failed", refundNeeded: true });
});

test("stale generating rows", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  assert.equal(isStale(null, now), false);
  assert.equal(isStale(new Date(now.getTime() - STALE_GENERATING_MS - 1), now), true);
  assert.equal(isStale(new Date(now.getTime() - 1000), now), false);
});

test("host view hides internals", () => {
  assert.equal(hostView("pending_payment"), "paying");
  assert.equal(hostView("generating"), "making");
  assert.equal(hostView("refunded"), "failed");
  assert.equal(hostView("cancelled"), "none");
});

test("provider order: Google first by default, fal fallback, unknowns dropped", () => {
  assert.deepEqual(providerOrder(undefined), ["vertex", "fal"]);
  assert.deepEqual(providerOrder("fal"), ["fal"]);
  assert.deepEqual(providerOrder("fal, vertex, kling, fal"), ["fal", "vertex"]);
  assert.deepEqual(providersToTry(undefined, { vertex: false, fal: true }), ["fal"]);
  assert.deepEqual(providersToTry(undefined, { vertex: false, fal: false }), []);
});

test("google prompt carries the line verbatim, quotes neutralised", () => {
  const p = speakingPrompt("Three pandas at a wedding.", 'Come "celebrate" with us');
  assert.ok(p.includes(`"Come 'celebrate' with us"`));
  assert.ok(p.includes("Single continuous shot"));
});

const paidSession = (meta: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", metadata: meta, payment_status: "paid", payment_intent: "pi_1", amount_total: 300, ...extra } },
});

test("webhook routing ignores other apps and unpaid sessions", () => {
  const meta = { app: "rsvpvault", kind: "video_invite", order_id: "o1" };
  assert.deepEqual(routeStripeEvent(paidSession(meta)), {
    kind: "paid",
    orderId: "o1",
    sessionId: "cs_1",
    paymentIntent: "pi_1",
    amountTotal: 300,
  });
  assert.equal(routeStripeEvent(paidSession({ ...meta, app: "advault" })).kind, "ignore");
  assert.equal(routeStripeEvent(paidSession({ app: "rsvpvault", kind: "other", order_id: "o1" })).kind, "ignore");
  assert.equal(routeStripeEvent(paidSession(meta, { payment_status: "unpaid" })).kind, "ignore");
  assert.equal(routeStripeEvent({ ...paidSession(meta), type: "checkout.session.expired" }).kind, "expired");
  assert.equal(routeStripeEvent({ ...paidSession(meta), type: "invoice.paid" }).kind, "ignore");
  assert.equal(routeStripeEvent({}).kind, "ignore");
});

test("stripe signature: valid, wrong secret, replayed", () => {
  const body = '{"a":1}';
  const now = 1_800_000_000;
  const sig = createHmac("sha256", "whsec_x").update(`${now}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig}`, "whsec_x", now), true);
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig}`, "whsec_y", now), false);
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig}`, "whsec_x", now + 301), false);
  assert.equal(verifyStripeSignature(body, undefined, "whsec_x", now), false);
});

test("checkout form tags the session and the payment as rsvpvault", () => {
  const f = checkoutForm({
    orderId: "o1",
    eventId: "e1",
    hostEmail: "h@example.com",
    amountCents: 500,
    productName: "RsvpVault video invite",
    successUrl: "https://x/s",
    cancelUrl: "https://x/c",
  });
  assert.equal(f.get("metadata[app]"), "rsvpvault");
  assert.equal(f.get("metadata[kind]"), "video_invite");
  assert.equal(f.get("payment_intent_data[metadata][order_id]"), "o1");
  assert.equal(f.get("line_items[0][price_data][unit_amount]"), "500");
  assert.equal(f.get("mode"), "payment");
  assert.equal(f.get("metadata[test_mode]"), null, "real orders are not tagged test");
});

test("test-mode checkout is tagged test_mode=1 and a test host's .invalid email is not sent to Stripe", () => {
  const f = checkoutForm({
    orderId: "o2",
    eventId: "e1",
    hostEmail: null,
    amountCents: 50,
    productName: "RsvpVault video invite",
    successUrl: "https://x/s",
    cancelUrl: "https://x/c",
    testMode: true,
  });
  assert.equal(f.get("metadata[test_mode]"), "1");
  assert.equal(f.get("payment_intent_data[metadata][test_mode]"), "1");
  assert.equal(f.get("customer_email"), null);
  assert.equal(f.get("line_items[0][price_data][unit_amount]"), "50");
});
