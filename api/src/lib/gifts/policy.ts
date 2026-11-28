// Cash gifts with the RSVP: every pure rule (fees, caps, states, webhook
// routing). No database, no Stripe calls: see the sibling modules.
//
// Money model (owner decision 2026-11-26): Stripe Connect DESTINATION
// charges. The guest pays one Checkout payment on the platform account; Stripe
// moves the gift to the host's Express account (transfer_data.destination).
// The platform is the merchant of record and the fee payer, and is liable for
// refunds and chargebacks; host payouts are delayed 7 days so a dispute can be
// absorbed. The guest pays:
//
//   gift (A)  +  our cut (P = A x GIFT_PLATFORM_FEE_BPS)  +  card fee (S)
//
// where S covers Stripe's percentage + fixed fee on the WHOLE total, so the
// platform's application_fee_amount = P + S nets exactly P after Stripe takes
// its fee from the platform, and the host receives exactly A.

export type FeeConfig = {
  /** Our cut, basis points of the gift. Default 150 = 1.5%. */
  platformFeeBps: number;
  /** Stripe's card percentage, basis points of the charged total. Default 290 = 2.9%. */
  stripePercentBps: number;
  /** Stripe's fixed card fee, cents. Default 30. */
  stripeFixedCents: number;
};

export const DEFAULT_FEES: FeeConfig = { platformFeeBps: 150, stripePercentBps: 290, stripeFixedCents: 30 };

export type GiftLimits = {
  minCents: number;
  maxCents: number;
  /** Per event, per UTC day, gifts paid or in checkout. */
  eventDailyCapCents: number;
  /** Per event, all time, gifts paid or in checkout (a lost card or a stolen one can't fund a whole wedding). */
  eventTotalCapCents: number;
};

// Owner decision 2026-11-27: $500 per gift (spec example), $2,000 per event per
// day, $5,000 per event in total. All env-configurable.
export const DEFAULT_LIMITS: GiftLimits = {
  minCents: 500,
  maxCents: 50_000,
  eventDailyCapCents: 200_000,
  eventTotalCapCents: 500_000,
};

function intEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function feeConfigFrom(env: Record<string, string | undefined>): FeeConfig {
  return {
    platformFeeBps: intEnv(env.GIFT_PLATFORM_FEE_BPS, DEFAULT_FEES.platformFeeBps, 0, 1000),
    stripePercentBps: intEnv(env.GIFT_STRIPE_PERCENT_BPS, DEFAULT_FEES.stripePercentBps, 0, 1000),
    stripeFixedCents: intEnv(env.GIFT_STRIPE_FIXED_CENTS, DEFAULT_FEES.stripeFixedCents, 0, 500),
  };
}

export function limitsFrom(env: Record<string, string | undefined>): GiftLimits {
  const minCents = intEnv(env.GIFT_MIN_CENTS, DEFAULT_LIMITS.minCents, 100, 100_000);
  return {
    minCents,
    maxCents: Math.max(minCents, intEnv(env.GIFT_MAX_CENTS, DEFAULT_LIMITS.maxCents, 100, 1_000_000)),
    eventDailyCapCents: intEnv(env.GIFT_EVENT_DAILY_CAP_CENTS, DEFAULT_LIMITS.eventDailyCapCents, 100, 10_000_000),
    eventTotalCapCents: intEnv(env.GIFT_EVENT_CAP_CENTS, DEFAULT_LIMITS.eventTotalCapCents, 100, 100_000_000),
  };
}

export type GiftBreakdown = {
  /** What the host receives. */
  giftCents: number;
  /** Our cut. */
  platformCents: number;
  /** The card processing fee the guest covers. */
  cardFeeCents: number;
  /** What the guest pays. */
  totalCents: number;
  /** application_fee_amount on the destination charge = platform + card fee. */
  applicationFeeCents: number;
};

/**
 * The fee breakdown for a gift. The total is grossed up so Stripe's fee on
 * the whole total is covered: T = ceil((A + P + fixed) / (1 - pct)).
 */
export function giftBreakdown(giftCents: number, fees: FeeConfig = DEFAULT_FEES): GiftBreakdown {
  const platformCents = Math.round((giftCents * fees.platformFeeBps) / 10_000);
  const pct = fees.stripePercentBps / 10_000;
  const totalCents = Math.ceil((giftCents + platformCents + fees.stripeFixedCents) / (1 - pct));
  const cardFeeCents = totalCents - giftCents - platformCents;
  return { giftCents, platformCents, cardFeeCents, totalCents, applicationFeeCents: platformCents + cardFeeCents };
}

/** Stripe's fee on a total, as Stripe would charge it (for tests / checks). */
export function stripeFeeOn(totalCents: number, fees: FeeConfig = DEFAULT_FEES): number {
  return Math.round((totalCents * fees.stripePercentBps) / 10_000) + fees.stripeFixedCents;
}

export type AmountProblem = "amount_not_whole_cents" | "amount_too_small" | "amount_too_large";

export function amountProblem(cents: number, limits: GiftLimits): AmountProblem | null {
  if (!Number.isInteger(cents)) return "amount_not_whole_cents";
  if (cents < limits.minCents) return "amount_too_small";
  if (cents > limits.maxCents) return "amount_too_large";
  return null;
}

/** Would this gift push the event over its daily cap? */
export function overDailyCap(todayCents: number, giftCents: number, limits: GiftLimits): boolean {
  return todayCents + giftCents > limits.eventDailyCapCents;
}

/** Would this gift push the event over its all-time cap? */
export function overEventCap(eventCents: number, giftCents: number, limits: GiftLimits): boolean {
  return eventCents + giftCents > limits.eventTotalCapCents;
}

/**
 * Which Stripe mode a host's gifts run in. GIFTS_STRIPE_MODE must be exactly
 * `live` for real money; anything else (unset included) keeps EVERY host on
 * the TEST key. A host in test mode (admin testing as host, test host) is
 * always TEST, even when gifts are live.
 */
export function giftStripeMode(raw: string | undefined, hostTestMode: boolean): "live" | "test" {
  return (raw ?? "").trim().toLowerCase() === "live" && !hostTestMode ? "live" : "test";
}

/** A plausible email address from Stripe, lower-cased; anything else is null. */
export function cleanEmail(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && !t.endsWith(".invalid") ? t : null;
}

/** Host's suggested amounts: up to 4, whole dollars, inside the limits, unique, sorted. */
export function cleanSuggestedAmounts(raw: number[], limits: GiftLimits): number[] {
  const ok = raw
    .filter((c) => Number.isInteger(c) && c % 100 === 0 && c >= limits.minCents && c <= limits.maxCents);
  return [...new Set(ok)].sort((a, b) => a - b).slice(0, 4);
}

/** Free text from a guest or host: control characters out, trimmed, capped. */
export function cleanText(raw: string | null | undefined, max: number): string | null {
  const t = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Host's connected (Express) account status, from the Stripe account object.
// ---------------------------------------------------------------------------

export type AccountStatus = "none" | "needs_info" | "pending" | "ready";

export type AccountLike = {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[] | null; disabled_reason?: string | null } | null;
  /** v1 view of capabilities ("active" / "inactive" / "pending"). */
  capabilities?: { transfers?: string; card_payments?: string } | null;
};

/**
 * Ready = can receive a destination charge's transfer and be paid out. An
 * Accounts v2 recipient-only account (the default since 2026-11-27) has
 * transfers but no card_payments, so charges_enabled stays false on it:
 * readiness is `transfers` active + payouts enabled. A v1 Express account
 * with card_payments still counts via charges_enabled.
 */
export function accountStatus(a: AccountLike | null | undefined): AccountStatus {
  if (!a) return "none";
  if (a.payouts_enabled && (a.capabilities?.transfers === "active" || a.charges_enabled)) return "ready";
  if (!a.details_submitted || (a.requirements?.currently_due?.length ?? 0) > 0) return "needs_info";
  return "pending";
}

// ---------------------------------------------------------------------------
// Gift lifecycle.
//
//   pending --(checkout paid)--> paid --(refund)--> refunded
//   pending --(checkout expired)--> expired
//   paid --(dispute opened)--> disputed --(won)--> paid
//                                       --(lost)--> dispute_lost
// ---------------------------------------------------------------------------

export const GIFT_STATUSES = ["pending", "paid", "expired", "refunded", "disputed", "dispute_lost"] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

const GIFT_TRANSITIONS: Record<GiftStatus, readonly GiftStatus[]> = {
  pending: ["paid", "expired"],
  paid: ["refunded", "disputed"],
  disputed: ["paid", "dispute_lost", "refunded"],
  expired: [],
  refunded: [],
  dispute_lost: [],
};

export function canGiftTransition(from: GiftStatus, to: GiftStatus): boolean {
  return GIFT_TRANSITIONS[from].includes(to);
}

/** Statuses that count against an event's daily cap (money in or in flight). */
export const CAP_STATUSES: readonly GiftStatus[] = ["pending", "paid", "disputed"];

// ---------------------------------------------------------------------------
// Webhook routing for gifts and Connect accounts (shared /webhooks/stripe).
// ---------------------------------------------------------------------------

type Obj = {
  id?: string;
  object?: string;
  metadata?: Record<string, string> | null;
  payment_status?: string;
  payment_intent?: string | null;
  amount_total?: number | null;
  customer_details?: { email?: string | null } | null;
  refunded?: boolean;
  charge?: string | null;
  status?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: AccountLike["requirements"];
  capabilities?: AccountLike["capabilities"];
};

export type StripeEventIn = {
  type?: string;
  livemode?: boolean;
  account?: string;
  data?: { object?: Obj };
};

export type GiftWebhookAction =
  | { kind: "none" }
  | { kind: "account_updated"; accountId: string; live: boolean; status: AccountStatus }
  | {
      kind: "gift_paid";
      giftId: string;
      sessionId: string;
      paymentIntent: string | null;
      amountTotal: number | null;
      /** Stripe's livemode: must match the gift's mode (a test event can never pay a live gift). */
      live: boolean;
      guestEmail: string | null;
    }
  | { kind: "gift_expired"; giftId: string }
  | { kind: "gift_refunded"; paymentIntent: string }
  | { kind: "gift_disputed"; paymentIntent: string }
  | { kind: "gift_dispute_closed"; paymentIntent: string; won: boolean };

export function routeGiftEvent(e: StripeEventIn): GiftWebhookAction {
  const obj = e.data?.object;
  if (!obj) return { kind: "none" };

  if (e.type === "account.updated" && obj.id && obj.object === "account") {
    return { kind: "account_updated", accountId: obj.id, live: e.livemode === true, status: accountStatus(obj) };
  }

  const meta = obj.metadata ?? {};
  const isGiftSession = meta.app === "rsvpvault" && meta.kind === "gift" && !!meta.gift_id && !!obj.id;
  if (isGiftSession && (e.type === "checkout.session.completed" || e.type === "checkout.session.async_payment_succeeded")) {
    if (obj.payment_status !== "paid") return { kind: "none" };
    return {
      kind: "gift_paid",
      giftId: meta.gift_id!,
      sessionId: obj.id!,
      paymentIntent: obj.payment_intent ?? null,
      amountTotal: obj.amount_total ?? null,
      live: e.livemode === true,
      guestEmail: obj.customer_details?.email ?? null,
    };
  }
  if (isGiftSession && e.type === "checkout.session.expired") return { kind: "gift_expired", giftId: meta.gift_id! };

  // Charge / dispute events carry the payment intent, which a paid gift stores.
  // Only a FULL refund ends a gift; a partial one leaves it paid (ops sees it in Stripe).
  if (e.type === "charge.refunded" && obj.payment_intent && obj.refunded === true) return { kind: "gift_refunded", paymentIntent: obj.payment_intent };
  if (e.type === "charge.dispute.created" && obj.payment_intent) return { kind: "gift_disputed", paymentIntent: obj.payment_intent };
  if (e.type === "charge.dispute.closed" && obj.payment_intent) {
    return { kind: "gift_dispute_closed", paymentIntent: obj.payment_intent, won: obj.status === "won" };
  }
  return { kind: "none" };
}

export type GiftRow = { status: GiftStatus; totalCents: number; testMode: boolean };
export type PaidDecision = "apply" | "already" | "amount_mismatch" | "mode_mismatch";

/**
 * What a "checkout paid" event does to a gift row. Pure, so idempotency is
 * testable: only `apply` writes (and the write is still conditional on
 * status = pending), and only a write that changed a row sends the emails.
 */
export function decideGiftPaid(g: GiftRow, a: { amountTotal: number | null; live: boolean }): PaidDecision {
  // Only from pending: disputed -> paid is the dispute-won path, never a replayed checkout.
  if (g.status !== "pending") return "already";
  if (a.live === g.testMode) return "mode_mismatch";
  if (a.amountTotal !== null && a.amountTotal !== g.totalCents) return "amount_mismatch";
  return "apply";
}

/** The exact Stripe event types this app needs (documented in ROUTES.md and the PR). */
export const PLATFORM_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;
export const CONNECT_EVENT_TYPES = ["account.updated"] as const;
