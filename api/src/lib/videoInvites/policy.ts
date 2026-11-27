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

/**
 * Price in cents for a tier, from the env override when it is a sane value.
 * Simple may be set to 0 (free: no Stripe, straight to the render queue, rate
 * limited per host). Pro always costs money: it pays for Google / fal.
 */
export function priceCents(tier: VideoInviteTier, override: string | undefined): number {
  if (override === undefined || override.trim() === "") return DEFAULT_PRICE_CENTS[tier];
  const n = Number(override);
  if (tier === "simple" && n === 0) return 0;
  if (Number.isInteger(n) && n >= 50 && n <= 10_000) return n;
  return DEFAULT_PRICE_CENTS[tier];
}

// Free Simple videos are cheap to render (seconds of ffmpeg) but not free to
// store, so a host gets at most this many per UTC day.
export const FREE_SIMPLE_PER_DAY = 5;

export function freeLimitReached(madeToday: number): boolean {
  return madeToday >= FREE_SIMPLE_PER_DAY;
}

// ---------------------------------------------------------------------------
// Simple tier = a TEMPLATE video: one pre-made 8 s 9:16 clip per occasion
// (pandas in the lower half, clean background in the top ~40%), with the
// host's invitation text drawn into that top area by ffmpeg in the API
// container (lib/videoInvites/compose.ts). No Google, no fal, no voice.
// ---------------------------------------------------------------------------

export type TextLines = {
  /** Small line on top, e.g. "You're invited to". */
  kicker: string;
  /** The big line: names or the event title. Required. */
  headline: string;
  /** Date and time, as the host wants it written. */
  when: string;
  /** The place. */
  where: string;
};

export const TEXT_LINE_MAX: Record<keyof TextLines, number> = {
  kicker: 40,
  headline: 60,
  when: 60,
  where: 80,
};

export type TextLinesProblem = "headline_required" | "line_too_long" | "line_has_link";

/** Cleans every line (control characters out, whitespace collapsed). */
export function cleanTextLines(raw: Partial<Record<keyof TextLines, string | null | undefined>>): TextLines {
  const one = (v: string | null | undefined) =>
    (v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return { kicker: one(raw.kicker), headline: one(raw.headline), when: one(raw.when), where: one(raw.where) };
}

export function textLinesProblem(lines: TextLines): TextLinesProblem | null {
  if (!lines.headline) return "headline_required";
  for (const k of Object.keys(TEXT_LINE_MAX) as (keyof TextLines)[]) {
    if (lines[k].length > TEXT_LINE_MAX[k]) return "line_too_long";
    if (/(https?:\/\/|www\.)\S+/i.test(lines[k])) return "line_has_link";
  }
  return null;
}

/** One line of text as drawn: its words, pixel size and baseline-free y (top). */
export type DrawnLine = { text: string; size: number; y: number; role: keyof TextLines };

// The frame every template clip is scaled to before drawing.
export const FRAME = { width: 1080, height: 1920 } as const;
// Text lives in the top TEXT_AREA of the frame, with side margins.
export const TEXT_AREA = { top: 110, bottom: Math.round(1920 * 0.4), side: 80 } as const;
const BASE_SIZE: Record<keyof TextLines, number> = { kicker: 46, headline: 104, when: 52, where: 46 };
const MIN_SIZE: Record<keyof TextLines, number> = { kicker: 32, headline: 56, when: 36, where: 32 };
// Average glyph width as a share of the font size, for the bundled sans font.
// Deliberately generous so a measured line never overflows the frame.
const CHAR_WIDTH = 0.56;
const LINE_GAP = 0.32;

// Absolute floor: at this size even the longest allowed line (80 characters)
// fits the frame, so text never runs off the edge.
export const HARD_MIN_SIZE = 20;

/**
 * Largest size <= base at which `text` fits `width` px. `min` is the size we
 * would rather not go below (the layout wraps the headline instead), but a
 * line that still doesn't fit shrinks further, down to HARD_MIN_SIZE: fitting
 * the frame beats the preferred minimum.
 */
export function fitSize(text: string, width: number, base: number, min: number): number {
  if (!text) return base;
  const fits = Math.floor(width / (text.length * CHAR_WIDTH));
  if (fits >= min) return Math.min(base, fits);
  return Math.max(HARD_MIN_SIZE, fits);
}

/** Splits text into two lines at the word nearest the middle. */
export function splitInTwo(text: string): [string, string] {
  const words = text.split(" ");
  if (words.length < 2) return [text, ""];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * Lays the lines out in the top text area: each auto-shrinks to the frame
 * width, the headline wraps onto two lines when even its minimum size
 * overflows, and the block is centred vertically in the area, shrinking
 * everything together if it is too tall. Pure, so preview and render agree
 * on the rules and the tests can pin them.
 */
export function layoutTextLines(lines: TextLines): DrawnLine[] {
  const width = FRAME.width - TEXT_AREA.side * 2;
  const areaHeight = TEXT_AREA.bottom - TEXT_AREA.top;

  const build = (scale: number): DrawnLine[] => {
    const out: DrawnLine[] = [];
    for (const role of ["kicker", "headline", "when", "where"] as const) {
      const text = lines[role];
      if (!text) continue;
      const base = Math.round(BASE_SIZE[role] * scale);
      const min = Math.round(MIN_SIZE[role] * scale);
      const parts =
        role === "headline" && text.length * CHAR_WIDTH * min > width ? splitInTwo(text).filter(Boolean) : [text];
      // Wrapped halves share one size, so the headline reads as one block.
      const size = Math.min(...parts.map((p) => fitSize(p, width, base, min)));
      for (const part of parts) out.push({ role, text: part, size, y: 0 });
    }
    return out;
  };

  let scale = 1;
  let drawn = build(scale);
  const height = (d: DrawnLine[]) => d.reduce((h, l, i) => h + l.size + (i ? l.size * LINE_GAP : 0), 0);
  while (height(drawn) > areaHeight && scale > 0.6) {
    scale -= 0.05;
    drawn = build(scale);
  }

  let y = TEXT_AREA.top + Math.max(0, Math.round((areaHeight - height(drawn)) / 2));
  return drawn.map((l, i) => {
    if (i) y += Math.round(l.size * LINE_GAP);
    const placed = { ...l, y };
    y += l.size;
    return placed;
  });
}

/** Clip file for an occasion, served from the web app. */
export function clipFileName(occasion: string): string {
  return `clip-${occasion}.mp4`;
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

/**
 * After a generation error: try once more, or give up. Giving up on a PAID
 * order flags a refund; a free one (price 0) has nothing to refund.
 */
export function afterFailure(
  attempts: number,
  priceCents = 1,
): { status: "paid" | "failed"; refundNeeded: boolean } {
  return attempts < MAX_GENERATION_ATTEMPTS
    ? { status: "paid", refundNeeded: false }
    : { status: "failed", refundNeeded: priceCents > 0 };
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
