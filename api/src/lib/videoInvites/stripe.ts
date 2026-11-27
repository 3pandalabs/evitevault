import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Stripe client for video invites: one Checkout Session per order and
// webhook signature checks. Plain fetch + form encoding (no SDK), the same
// shape AdVault uses. Every session carries metadata app=rsvpvault so the
// shared org Stripe account's other apps' events can be told apart.

const API = "https://api.stripe.com/v1";

// Read from process.env directly (not env.ts) so the pure helpers below stay
// importable from tests without a database URL. env.ts documents both vars.
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export type CheckoutRequest = {
  orderId: string;
  eventId: string;
  /** Omitted for a test host's undeliverable *.invalid address. */
  hostEmail: string | null;
  amountCents: number;
  /** Admin testing as host / test host: tagged test_mode=1, excluded from revenue. */
  testMode?: boolean;
  productName: string;
  successUrl: string;
  cancelUrl: string;
};

/** The form body sent to POST /v1/checkout/sessions (exported for tests). */
export function checkoutForm(req: CheckoutRequest): URLSearchParams {
  const meta: Record<string, string> = {
    app: "rsvpvault",
    kind: "video_invite",
    order_id: req.orderId,
    event_id: req.eventId,
    ...(req.testMode ? { test_mode: "1" } : {}),
  };
  const form = new URLSearchParams({
    mode: "payment",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    ...(req.hostEmail ? { customer_email: req.hostEmail } : {}),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(req.amountCents),
    "line_items[0][price_data][product_data][name]": req.productName,
    client_reference_id: req.orderId,
    // 30 minutes is Stripe's minimum; an abandoned checkout expires and the
    // webhook marks the order cancelled.
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
  });
  for (const [k, v] of Object.entries(meta)) {
    form.set(`metadata[${k}]`, v);
    form.set(`payment_intent_data[metadata][${k}]`, v);
  }
  return form;
}

export async function createCheckoutSession(req: CheckoutRequest): Promise<{ id: string; url: string }> {
  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      // One session per order, even if the host double-clicks Pay.
      "idempotency-key": `rsvpvault-video-${req.orderId}`,
    },
    body: checkoutForm(req),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !body.id || !body.url) {
    throw new Error(`stripe checkout failed: ${res.status} ${body.error?.message ?? ""}`.trim());
  }
  return { id: body.id, url: body.url };
}

/**
 * Stripe signs `${timestamp}.${rawBody}` and sends `t=<ts>,v1=<hex>[,v1=...]`
 * (several v1 during a secret rotation; any match passes). Replays older than
 * five minutes are refused, Stripe's own tolerance.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((kv) => kv.split("="));
  const ts = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!ts || sigs.length === 0) return false;
  const age = Math.abs(nowSeconds - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex"));
  return sigs.some((s) => {
    const a = Buffer.from(s ?? "");
    return a.length === expected.length && timingSafeEqual(a, expected);
  });
}
