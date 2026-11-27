// Stripe Connect calls for cash gifts: plain fetch + form encoding (no SDK),
// like lib/videoInvites/stripe.ts. Never called in tests.
//
// TWO Stripe modes, chosen per HOST (lib/testMode): a real host uses the live
// key (STRIPE_SECRET_KEY); an admin testing as host or a test host uses the
// TEST key (STRIPE_TEST_SECRET_KEY). With no test key configured, test-mode
// gifts are refused (gifts_test_unavailable): a test can never make a live
// charge. Keys are read from process.env directly so the pure helpers stay
// importable from tests.

const API = "https://api.stripe.com/v1";

export type StripeMode = "live" | "test";

export function stripeKey(mode: StripeMode): string {
  return (mode === "live" ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_TEST_SECRET_KEY) ?? "";
}

export function giftsStripeConfigured(mode: StripeMode): boolean {
  return Boolean(stripeKey(mode));
}

async function call<T>(
  mode: StripeMode,
  method: "GET" | "POST",
  path: string,
  form?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const key = stripeKey(mode);
  if (!key) throw new Error(`stripe ${mode} key not configured`);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`stripe ${method} ${path} ${res.status}: ${body.error?.message ?? ""}`.trim());
  return body;
}

/** The form for a new Express account (exported for tests). */
export function expressAccountForm(userId: string): URLSearchParams {
  return new URLSearchParams({
    type: "express",
    country: "US",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "business_type": "individual",
    // Payouts wait 7 days, so a refund or a dispute can come out of the
    // host's balance before the money has left (risk control, 2026-11-26).
    "settings[payouts][schedule][interval]": "daily",
    "settings[payouts][schedule][delay_days]": "7",
    "metadata[app]": "rsvpvault",
    "metadata[user_id]": userId,
  });
}

export type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[] | null; disabled_reason?: string | null } | null;
};

export function createExpressAccount(mode: StripeMode, userId: string): Promise<StripeAccount> {
  return call(mode, "POST", "/accounts", expressAccountForm(userId), `rsvpvault-acct-${mode}-${userId}`);
}

export function retrieveAccount(mode: StripeMode, accountId: string): Promise<StripeAccount> {
  return call(mode, "GET", `/accounts/${encodeURIComponent(accountId)}`);
}

/** Stripe-hosted onboarding link (single use, short-lived). */
export async function onboardingLink(mode: StripeMode, accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const link = await call<{ url: string }>(
    mode,
    "POST",
    "/account_links",
    new URLSearchParams({ account: accountId, return_url: returnUrl, refresh_url: refreshUrl, type: "account_onboarding" }),
  );
  return link.url;
}

/** One-time link into the host's Express dashboard. */
export async function expressLoginLink(mode: StripeMode, accountId: string): Promise<string> {
  const link = await call<{ url: string }>(mode, "POST", `/accounts/${encodeURIComponent(accountId)}/login_links`);
  return link.url;
}

export type GiftCheckout = {
  giftId: string;
  eventId: string;
  eventTitle: string;
  destination: string;
  giftCents: number;
  feesCents: number;
  applicationFeeCents: number;
  successUrl: string;
  cancelUrl: string;
  testMode: boolean;
};

/**
 * The Checkout form for a gift (exported for tests): two lines so the guest
 * sees the breakdown on Stripe's page too, a destination charge to the host,
 * and our application fee.
 */
export function giftCheckoutForm(g: GiftCheckout): URLSearchParams {
  const meta: Record<string, string> = {
    app: "rsvpvault",
    kind: "gift",
    gift_id: g.giftId,
    event_id: g.eventId,
    ...(g.testMode ? { test_mode: "1" } : {}),
  };
  const form = new URLSearchParams({
    mode: "payment",
    submit_type: "pay",
    success_url: g.successUrl,
    cancel_url: g.cancelUrl,
    client_reference_id: g.giftId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(g.giftCents),
    "line_items[0][price_data][product_data][name]": `Gift for ${g.eventTitle}`.slice(0, 120),
    "line_items[1][quantity]": "1",
    "line_items[1][price_data][currency]": "usd",
    "line_items[1][price_data][unit_amount]": String(g.feesCents),
    "line_items[1][price_data][product_data][name]": "Card processing and service fee",
    "payment_intent_data[transfer_data][destination]": g.destination,
    "payment_intent_data[application_fee_amount]": String(g.applicationFeeCents),
    "payment_intent_data[description]": `RsvpVault gift: ${g.eventTitle}`.slice(0, 200),
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
  });
  for (const [k, v] of Object.entries(meta)) {
    form.set(`metadata[${k}]`, v);
    form.set(`payment_intent_data[metadata][${k}]`, v);
  }
  return form;
}

export function createGiftCheckout(mode: StripeMode, g: GiftCheckout): Promise<{ id: string; url: string }> {
  return call(mode, "POST", "/checkout/sessions", giftCheckoutForm(g), `rsvpvault-gift-${g.giftId}`);
}
