// Video invites: every pure decision lives here, so it is testable without a
// database, Stripe or fal. Anything that reaches for db/fetch belongs in the
// sibling modules.
//
// Two tiers, both PAID (owner decision 2026-11-26):
//   simple — the host types what to say; our three pandas say it in a scene
//            for the occasion.
//   pro    — the host uploads their own photo and the photo says it
//            (lip-synced). Needs an attestation that it's them or they have
//            consent from everyone in it, stored with who and when.

export const VIDEO_INVITE_TIERS = ["simple", "pro"] as const;
export type VideoInviteTier = (typeof VIDEO_INVITE_TIERS)[number];

// One panda scene per occasion (web/public/video-invites/pandas-<occasion>.jpg,
// 9:16, Anil-supplied, all showing our three established pandas). The pro tier
// ignores it: the host's photo is the scene. A new occasion needs its scene
// file too (web/scripts/generate-panda-scenes.mjs can draft one).
export const VIDEO_INVITE_OCCASIONS = [
  "wedding",
  "birthday",
  "baby-shower",
  "anniversary",
  "graduation",
  "housewarming",
  "diwali",
  "holiday",
  "party",
  "thanksgiving",
] as const;
export type VideoInviteOccasion = (typeof VIDEO_INVITE_OCCASIONS)[number];

export const OCCASION_LABELS: Record<VideoInviteOccasion, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  "baby-shower": "Baby shower",
  anniversary: "Anniversary",
  graduation: "Graduation",
  housewarming: "Housewarming",
  diwali: "Diwali / puja",
  holiday: "Holiday party",
  party: "Any party",
  thanksgiving: "Thanksgiving",
};

// ~13 seconds of speech at a normal pace (~15 characters a second). Google
// Omni (the first provider) makes at most 15 s clips, and every provider bills
// per second of output, so the cap is also the cost cap.
export const MAX_SCRIPT_CHARS = 200;
export const MIN_SCRIPT_CHARS = 10;

export const DEFAULT_PRICE_CENTS: Record<VideoInviteTier, number> = { simple: 300, pro: 500 };

export const ATTESTATION_TEXT = "This is me, or I have consent from everyone in this photo.";

// Who makes the video. Google (Vertex Omni, speaks the line with its own
// generated audio) first, fal (ElevenLabs TTS + talking avatar) as fallback,
// the same order AdVault uses for Omni footage.
export const VIDEO_PROVIDERS = ["vertex", "fal"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

/** Parsed VIDEO_INVITE_PROVIDERS (default "vertex,fal"), unknown names dropped. */
export function providerOrder(raw: string | undefined): VideoProvider[] {
  const list = (raw ?? "vertex,fal")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is VideoProvider => (VIDEO_PROVIDERS as readonly string[]).includes(s));
  return [...new Set(list)];
}

/** The providers to try, in order, given which ones are configured. */
export function providersToTry(
  raw: string | undefined,
  configured: Record<VideoProvider, boolean>,
): VideoProvider[] {
  return providerOrder(raw).filter((p) => configured[p]);
}

export function isEnabled(flag: string | undefined): boolean {
  return (flag ?? "").trim().toLowerCase() === "on";
}

/** Price in cents for a tier, from the env override when it is a sane value. */
export function priceCents(tier: VideoInviteTier, override: string | undefined): number {
  const n = Number(override);
  if (Number.isInteger(n) && n >= 50 && n <= 10_000) return n;
  return DEFAULT_PRICE_CENTS[tier];
}

/**
 * Cleans what the host typed into what the voice reads: control characters
 * out, whitespace collapsed, bracketed "[tags]" removed (ElevenLabs v3 reads
 * them as stage directions, and a host should not be able to steer the voice
 * into something other than their words).
 */
export function cleanScript(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/\[[^\]]{0,40}\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ScriptProblem = "script_too_short" | "script_too_long" | "script_has_link";

export function scriptProblem(script: string): ScriptProblem | null {
  if (script.length < MIN_SCRIPT_CHARS) return "script_too_short";
  if (script.length > MAX_SCRIPT_CHARS) return "script_too_long";
  // A spoken link is useless and a written one is how this would get used for
  // spam; the invitation page already carries the real link.
  if (/(https?:\/\/|www\.)\S+/i.test(script)) return "script_has_link";
  return null;
}

/** Rough spoken length, shown to the host before they pay. */
export function estimatedSeconds(script: string): number {
  return Math.max(3, Math.round(script.length / 15));
}

// ---------------------------------------------------------------------------
// Order lifecycle.
//
//   pending_payment --(webhook: paid)--> paid --(job claims)--> generating
//   generating --> ready | paid (retry) | failed
//   failed --(ops refund in Stripe)--> refunded
//   pending_payment --(checkout expired)--> cancelled
//
// Generation starts ONLY from `paid`, and `paid` is only ever written by the
// verified Stripe webhook. A failed order sets refund_needed, so a charge for
// nothing is always visible to ops (never silently kept).
// ---------------------------------------------------------------------------

export const VIDEO_INVITE_STATUSES = [
  "pending_payment",
  "paid",
  "generating",
  "ready",
  "failed",
  "refunded",
  "cancelled",
] as const;
export type VideoInviteStatus = (typeof VIDEO_INVITE_STATUSES)[number];

const TRANSITIONS: Record<VideoInviteStatus, readonly VideoInviteStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["generating"],
  generating: ["ready", "paid", "failed"],
  ready: [],
  failed: ["refunded"],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: VideoInviteStatus, to: VideoInviteStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const MAX_GENERATION_ATTEMPTS = 2;

/** After a generation error: try once more, or give up and flag a refund. */
export function afterFailure(attempts: number): { status: "paid" | "failed"; refundNeeded: boolean } {
  return attempts < MAX_GENERATION_ATTEMPTS
    ? { status: "paid", refundNeeded: false }
    : { status: "failed", refundNeeded: true };
}

// A row stuck in `generating` this long belongs to a process that died
// mid-job (a deploy, a crash). The job hands it back to `paid`.
export const STALE_GENERATING_MS = 20 * 60 * 1000;

export function isStale(startedAt: Date | null, now: Date): boolean {
  return startedAt !== null && now.getTime() - startedAt.getTime() > STALE_GENERATING_MS;
}

/** Host-facing state, without internals (error text, Stripe ids). */
export function hostView(status: VideoInviteStatus): "paying" | "making" | "ready" | "failed" | "none" {
  switch (status) {
    case "pending_payment":
      return "paying";
    case "paid":
    case "generating":
      return "making";
    case "ready":
      return "ready";
    case "failed":
    case "refunded":
      return "failed";
    case "cancelled":
      return "none";
  }
}

// ---------------------------------------------------------------------------
// Stripe webhook routing. The org's Stripe account is shared by every app, so
// this endpoint sees AdVault's and SiteVault's events too; anything not tagged
// app=rsvpvault is acknowledged and ignored.
// ---------------------------------------------------------------------------

export type StripeEventLike = {
  type?: string;
  data?: { object?: { id?: string; metadata?: Record<string, string> | null; payment_status?: string; payment_intent?: string | null; amount_total?: number | null } };
};

export type WebhookAction =
  | { kind: "ignore" }
  | { kind: "paid"; orderId: string; sessionId: string; paymentIntent: string | null; amountTotal: number | null }
  | { kind: "expired"; orderId: string; sessionId: string };

export function routeStripeEvent(event: StripeEventLike): WebhookAction {
  const obj = event.data?.object;
  const meta = obj?.metadata ?? {};
  if (meta.app !== "rsvpvault" || meta.kind !== "video_invite" || !meta.order_id || !obj?.id) {
    return { kind: "ignore" };
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    // "completed" fires for delayed methods before money arrives; only a paid
    // session may start a render that costs us real money.
    if (obj.payment_status !== "paid") return { kind: "ignore" };
    return {
      kind: "paid",
      orderId: meta.order_id,
      sessionId: obj.id,
      paymentIntent: obj.payment_intent ?? null,
      amountTotal: obj.amount_total ?? null,
    };
  }
  if (event.type === "checkout.session.expired") {
    return { kind: "expired", orderId: meta.order_id, sessionId: obj.id };
  }
  return { kind: "ignore" };
}
