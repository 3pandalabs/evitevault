"use client";

import type { CardDesign } from "../card/spec";
import { API_URL, ApiError } from "./browser";

// The host dashboard is client-rendered and talks to the API directly from the
// browser, rather than through Server Components. Two reasons:
//   - it sidesteps the orange-to-orange restriction entirely (see
//     wrangler.jsonc) — no server-side fetch, no DNS-only hostname needed;
//   - the API is the only real authorization boundary anyway, so putting a
//     rendering layer in front of it buys nothing but a second place for the
//     auth check to be subtly wrong.
// The public invitation is the opposite case and IS server-rendered: it must be
// fast on a phone and produce link previews.

const ACCESS_KEY = "ev_access_token";
const REFRESH_KEY = "ev_refresh_token";

export function getTokens() {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access: window.localStorage.getItem(ACCESS_KEY),
    refresh: window.localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens(access: string, refresh: string) {
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

async function refreshTokens(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

// Access tokens live 15 minutes, so a 401 mid-session is expected, not
// exceptional. Retry once after refreshing; a second 401 means the refresh
// token is gone too and the caller should send the user to /login.
export async function hostFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        // Only when there IS a body. Fastify rejects a request that declares
        // application/json and then sends nothing (FST_ERR_CTP_EMPTY_JSON_BODY)
        // before routing it, so a bodyless POST — publish, and any other
        // action-shaped endpoint — failed with a generic error that looked like
        // the route was missing.
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  let res = await send(getTokens().access);

  if (res.status === 401) {
    const fresh = await refreshTokens();
    if (!fresh) throw new ApiError(401, "not_authenticated");
    res = await send(fresh);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? "request_failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  locationName: string | null;
  // Present on GET /events/:id (the full row) but not on the list projection,
  // which selects only what the dashboard cards render.
  coverImageKey?: string | null;
  // Also only on the full row. Determines whether a scanned QR can actually
  // lead to an RSVP, or only to a "this invitation is personal" message.
  allowPublicRsvp?: boolean;
  // Also only on the full row. The album link the host shares after the event.
  photoAlbumUrl?: string | null;
  // Also only on the full row. True when the saved card image no longer matches
  // the event — the image is flattened at export and never re-rendered, so it
  // goes stale silently while the invitation page stays correct.
  cardStale?: boolean;
  status: "draft" | "published" | "cancelled" | "archived";
  capacity: number | null;
  invited: number;
  attending: number;
  declined: number;
  maybe: number;
  pending: number;
  headcount: number;
  // Responses the host hasn't looked at yet. A guest changing their answer
  // counts, because responded_at moves.
  newResponses: number;
  // Only on the full row (GET /events/:id) — lets the detail page mark which
  // individual rows are new before clearing the marker.
  responsesSeenAt?: string | null;
};

export type GuestRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rsvpStatus: "pending" | "attending" | "declined" | "maybe";
  plusOnes: number;
  plusOneNames: string[] | null;
  dietaryNotes: string | null;
  message: string | null;
  source: "invited" | "public";
  // When mail actually reached them, not when the row was created. Null means
  // this guest is still waiting for an invitation, which is what the dashboard
  // counts.
  invitedAt: string | null;
  inviteToken: string;
  respondedAt: string | null;
  firstViewedAt: string | null;
};

export type Analytics = {
  rsvp: {
    invited: number;
    attending: number;
    declined: number;
    maybe: number;
    pending: number;
    headcount: number;
    opened: number;
  };
  views: {
    total: number;
    uniqueVisitors: number;
    byDay: { day: string; views: number }[];
  };
  responseRate: number;
};

export type Template = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  theme: {
    palette: { bg: string; surface: string; text: string; muted: string; accent: string; accentText: string };
    fonts: { heading: string; body: string };
    layout: string;
    // The design's built-in cover artwork (lib/coverArt.tsx). Optional: a
    // template row seeded before artwork existed simply has none.
    art?: string;
    // The template's starting card composition. Optional for the same reason.
    card?: Partial<CardDesign>;
  };
};

// Per-event tweaks merged over the chosen template, mirroring
// themeOverridesSchema in api/src/lib/theme.ts. Every level is partial: the
// card designer saves the one number the host just dragged, not the whole
// design, so two people editing different knobs don't overwrite each other.
export type ThemeOverrides = {
  palette?: Partial<Template["theme"]["palette"]>;
  fonts?: Partial<Template["theme"]["fonts"]>;
  layout?: string;
  art?: string;
  card?: Partial<Omit<CardDesign, "photo">> & { photo?: Partial<CardDesign["photo"]> };
};

export type EventInput = {
  title: string;
  description?: string | null;
  hostDisplayName?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  locationName?: string | null;
  locationAddress?: string | null;
  locationMapUrl?: string | null;
  templateId?: string | null;
  rsvpDeadline?: string | null;
  allowPlusOnes?: boolean;
  maxPlusOnes?: number;
  capacity?: number | null;
  collectDietary?: boolean;
  allowPublicRsvp?: boolean;
  guestbookEnabled?: boolean;
  guestPhotosEnabled?: boolean;
  showGuestList?: boolean;
  photoAlbumUrl?: string | null;
  // An empty object clears every override and restores the design's own look.
  themeOverrides?: ThemeOverrides | null;
};

export const listTemplates = () => hostFetch<{ templates: Template[] }>("/templates");

export const createEvent = (input: EventInput) =>
  hostFetch<{ id: string; slug: string }>("/events", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateEvent = (
  id: string,
  patch: Partial<EventInput> & { coverImageKey?: string | null; cardImageKey?: string | null },
) =>
  hostFetch<EventSummary>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

// Publishing makes the invitation link work. It sends nothing — guests can
// only be added once an event is published, so there is no list to mail at
// this point, and sending is the host's own next step.
export const publishEvent = (id: string) =>
  hostFetch<EventSummary>(`/events/${id}/publish`, { method: "POST" });

export const deleteEvent = (id: string) => hostFetch<void>(`/events/${id}`, { method: "DELETE" });

// --- Greetings -------------------------------------------------------------
// A greeting is a designed card with a message — the event model minus timing,
// location, RSVP, guests and any public page. See api/src/routes/greetings.ts.

export type GreetingSummary = {
  id: string;
  title: string;
  message: string | null;
  hostDisplayName: string | null;
  occasion: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  // Only on the full row (GET /greetings/:id); the list projection omits it.
  themeOverrides?: ThemeOverrides | null;
};

export type GreetingInput = {
  title: string;
  message?: string | null;
  hostDisplayName?: string | null;
  occasion?: string | null;
  templateId?: string | null;
  // An empty object clears every override and restores the design's own look.
  themeOverrides?: ThemeOverrides | null;
};

export const listGreetings = () => hostFetch<{ greetings: GreetingSummary[] }>("/greetings");

export const getGreeting = (id: string) => hostFetch<GreetingSummary>(`/greetings/${id}`);

export const createGreeting = (input: GreetingInput) =>
  hostFetch<{ id: string }>("/greetings", { method: "POST", body: JSON.stringify(input) });

export const updateGreeting = (id: string, patch: Partial<GreetingInput>) =>
  hostFetch<GreetingSummary>(`/greetings/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteGreeting = (id: string) =>
  hostFetch<void>(`/greetings/${id}`, { method: "DELETE" });

export type GreetingSendResult = {
  recipientCount: number;
  delivered: number;
  failed: number;
  skipped: number;
  emailConfigured: boolean;
};

// Emails the greeting to a raw address list. The card image is rendered in the
// browser and sent inline (base64) — greetings have no R2 key and no guests.
export const sendGreeting = (
  id: string,
  body: {
    recipients: { email: string; name?: string | null }[];
    image?: { content: string; type: "image/png" | "image/jpeg" } | null;
    subject?: string | null;
    message?: string | null;
  },
) =>
  hostFetch<GreetingSendResult>(`/greetings/${id}/send`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// A link that shows a draft exactly as guests will see it. The token inside is
// event-scoped and expires in two hours, so fetch one each time rather than
// storing it — it is a button, not a share link.
export const previewLink = (id: string) =>
  hostFetch<{ url: string; expiresInSeconds: number }>(`/events/${id}/preview-link`, {
    method: "POST",
  });

// Clears the "new responses" marker. Called after the detail page has rendered,
// so the host sees what was new before it's marked read.
export const markResponsesSeen = (id: string) =>
  hostFetch<{ responsesSeenAt: string }>(`/events/${id}/responses-seen`, { method: "POST" });

// Cover art can only be uploaded after the event exists — the R2 key is scoped
// to the event id, so there is nothing to presign against beforehand. The
// create form therefore saves first and offers the upload on the detail page.
export async function uploadCoverImage(eventId: string, file: File): Promise<string> {
  const { key, uploadUrl } = await hostFetch<{ key: string; uploadUrl: string }>(
    `/events/${eventId}/cover/presign-upload`,
    { method: "POST", body: JSON.stringify({ contentType: file.type }) },
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    // Must match the content type pinned into the signature, or R2 rejects it.
    headers: { "content-type": file.type },
    body: file,
  });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");

  await updateEvent(eventId, { coverImageKey: key });
  return key;
}

/**
 * Stores the flattened card the designer rendered.
 *
 * Same two-step as every other upload — presign, PUT straight to R2 — because
 * a 2160×2700 export is a few megabytes and has no business travelling through
 * Fastify. The PATCH that follows is what makes it the event's card; until then
 * the object is just bytes in a bucket, which is also what makes the failure
 * mode safe: a crash between the two leaves an orphan, never a broken event.
 *
 * The design itself is saved separately, as themeOverrides.card. This image is
 * derived from it and can always be re-rendered.
 */
export async function uploadCardImage(
  eventId: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
  const { key, uploadUrl } = await hostFetch<{ key: string; uploadUrl: string }>(
    `/events/${eventId}/card/presign-upload`,
    { method: "POST", body: JSON.stringify({ contentType }) },
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: blob,
  });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");

  await updateEvent(eventId, { cardImageKey: key });
  return key;
}

// Emails every guest with an address, each getting their own invite link so
// clicking through lands them on their own RSVP. Recorded server-side, so a
// host can see afterwards what was sent and to whom.
export const createAnnouncement = (
  eventId: string,
  input: { subject: string; body: string; audience?: "all" | "attending" | "pending" | "maybe" },
) =>
  hostFetch<{ id: string; recipientCount: number; delivered: number; skipped: number }>(
    `/events/${eventId}/announcements`,
    { method: "POST", body: JSON.stringify(input) },
  );

// Mails the event's photo album link — the URL comes from the saved event, not
// from this call, so save it first. Recorded alongside announcements.
export const sharePhotoAlbum = (
  eventId: string,
  input: { audience?: "all" | "attending" | "maybe"; message?: string | null },
) =>
  hostFetch<{
    id: string;
    recipientCount: number;
    delivered: number;
    failed: number;
    emailConfigured: boolean;
  }>(`/events/${eventId}/photo-album/share`, { method: "POST", body: JSON.stringify(input) });

// Mints a short-lived read URL for an object the host owns. The bucket is
// private, so a stored key is not a URL — it has to be exchanged for one every
// time it's rendered. The URL expires in 10 minutes; re-fetch rather than
// caching it anywhere durable.
export const presignDownload = (key: string) =>
  hostFetch<{ url: string }>("/storage/presign-download", {
    method: "POST",
    body: JSON.stringify({ key }),
  });

export const listEvents = () => hostFetch<{ events: EventSummary[] }>("/events");
export const getEvent = (id: string) => hostFetch<EventSummary & Record<string, unknown>>(`/events/${id}`);
export const listGuests = (id: string) => hostFetch<{ guests: GuestRow[] }>(`/events/${id}/guests`);
export const getAnalytics = (id: string) => hostFetch<Analytics>(`/events/${id}/analytics`);

export const addGuests = (id: string, guests: { name: string; email?: string | null }[]) =>
  hostFetch<{
    added: number;
    skipped: number;
    emailed: number;
    emailsFailed: number;
    failedGuests: FailedGuest[];
    emailConfigured: boolean;
    /** Test mode: invitations held back, not sent. */
    testNotSent?: number;
  }>(`/events/${id}/guests`, {
    method: "POST",
    // Adding a guest to a published event invites them, immediately. Adding
    // someone to the guest list of a live event IS the act of inviting them,
    // and a separate confirmation step only makes sense while the invitation
    // link might not work yet — which can no longer happen, because guests
    // cannot be added to a draft at all.
    //
    // The irreversibility that argued for a second step is handled by the
    // ordering instead: the host has already published, seen the live link,
    // and is now typing addresses into a box on that event. Nothing about that
    // reads as a dry run.
    body: JSON.stringify({ guests, sendInvites: true }),
  });

export type FailedGuest = { id: string; name: string; email: string };

// `guestIds` narrows the send to specific guests; the API still applies the
// `includeResponded` filter on top, so a re-send aimed at named guests passes
// `includeResponded: true` — otherwise anyone who has since replied is quietly
// dropped from a list the host explicitly chose.
export const sendInvitations = (id: string, includeResponded = false, guestIds?: string[]) =>
  hostFetch<{
    recipients: number;
    delivered: number;
    failed: number;
    failedGuests: FailedGuest[];
    emailConfigured: boolean;
    /** Test mode: invitations held back, not sent. */
    testNotSent?: number;
  }>(`/events/${id}/guests/send-invitations`, {
    method: "POST",
    body: JSON.stringify({ includeResponded, ...(guestIds?.length ? { guestIds } : {}) }),
  });

export const updateGuest = (eventId: string, guestId: string, patch: Partial<GuestRow>) =>
  hostFetch<GuestRow>(`/events/${eventId}/guests/${guestId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

// The CSV endpoint needs the Authorization header, so it can't just be an
// <a href>. Fetch it as a blob and trigger the download from an object URL.
export async function downloadGuestCsv(eventId: string, slug: string) {
  const { access } = getTokens();
  const res = await fetch(`${API_URL}/events/${eventId}/guests.csv`, {
    headers: access ? { authorization: `Bearer ${access}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, "download_failed");

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `guests-${slug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Permanently deletes the signed-in host and everything they own. The password
// is re-confirmed server-side; 403 `wrong_password` means it didn't match.
export const deleteAccount = (password: string) =>
  hostFetch<void>("/me/delete", { method: "POST", body: JSON.stringify({ password }) });

// --- Video invites (paid; off unless the API has VIDEO_INVITES=on) ----------

export type VideoInviteTier = "simple" | "pro";

export type VideoInviteLines = { kicker: string; headline: string; when: string; where: string };

export type VideoInviteInfo = {
  available: boolean;
  /** Per tier: can it be made right now (Simple: ffmpeg; Pro: Google/fal; paid: Stripe). */
  tiers?: Record<VideoInviteTier, boolean>;
  /** Max characters per Simple text line. */
  lineMax?: Record<keyof VideoInviteLines, number>;
  /** Free Simple videos per host per day (when Simple is free). */
  freePerDay?: number;
  prices: Record<VideoInviteTier, number>;
  occasions: { id: string; label: string }[];
  maxScriptChars: number;
  attestationText: string;
  order: {
    id: string;
    tier: VideoInviteTier;
    occasion: string;
    script: string;
    lines?: VideoInviteLines | null;
    state: "paying" | "making" | "ready" | "failed" | "none";
    createdAt: string;
    videoUrl: string | null;
  } | null;
};

/** Null when the feature is switched off (the API answers 404). */
export async function getVideoInvite(eventId: string): Promise<VideoInviteInfo | null> {
  try {
    return await hostFetch<VideoInviteInfo>(`/events/${eventId}/video-invite`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Pro tier: puts the host's photo straight into R2 and returns its key. */
export async function uploadVideoInvitePhoto(eventId: string, file: File): Promise<string> {
  const { key, uploadUrl } = await hostFetch<{ key: string; uploadUrl: string }>(
    `/events/${eventId}/video-invite/photo/presign-upload`,
    { method: "POST", body: JSON.stringify({ contentType: file.type }) },
  );
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");
  return key;
}

export async function startVideoInviteCheckout(
  eventId: string,
  input: {
    tier: VideoInviteTier;
    occasion: string;
    /** Pro: what the photo says. */
    script?: string;
    /** Simple: the lines written on the template clip. */
    lines?: VideoInviteLines;
    photoKey?: string | null;
    attested?: boolean;
  },
): Promise<{ checkoutUrl?: string; estimatedSeconds?: number; queued?: boolean }> {
  return hostFetch(`/events/${eventId}/video-invite/checkout`, { method: "POST", body: JSON.stringify(input) });
}

// --- Admin tools (lib/testMode in the API) ----------------------------------

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  /** The REAL role. */
  role: "host" | "admin";
  createdAt: string;
  /** Admin "Test as host" switch. */
  testAsHost: boolean;
  /** Inside an admin's test host. */
  testHost: boolean;
  /** Admin testing as host, or a test host: 50-cent charges, guest email held back. */
  testMode: boolean;
  isInternal: boolean;
  internalLabel: string | null;
  /**
   * Feature switches decided by the API (never inferred from `role` here).
   * videoInvites: VIDEO_INVITES=on, or =admins and this is a real admin or one
   * of their test hosts. The video invite card also asks the API itself and
   * renders nothing on a 404, so the two always agree.
   */
  features?: { videoInvites: boolean; cashGifts?: boolean };
};

export const getMe = () => hostFetch<Me>("/auth/me");

export const setTestMode = (on: boolean) =>
  hostFetch<{ testAsHost: boolean }>("/auth/me/test-mode", { method: "PATCH", body: JSON.stringify({ on }) });

export type TestHost = { id: string; name: string; createdAt: string };

export const listTestHosts = () => hostFetch<{ hosts: TestHost[]; current: string | null }>("/test-hosts");

export const createTestHost = (name: string) =>
  hostFetch<TestHost>("/test-hosts", { method: "POST", body: JSON.stringify({ name }) });

/** Switches this browser into a test host (or back): swaps the stored tokens. */
async function switchTo(path: string): Promise<void> {
  const { refresh } = getTokens();
  const tokens = await hostFetch<{ accessToken: string; refreshToken: string }>(path, {
    method: "POST",
    body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
  });
  setTokens(tokens.accessToken, tokens.refreshToken);
}

export const switchIntoTestHost = (id: string) => switchTo(`/test-hosts/${id}/switch`);
export const switchBackToAdmin = () => switchTo("/test-hosts/back");

export type AdminOverview = Record<string, number>;

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "host" | "admin";
  createdAt: string;
  testAsHost: boolean;
  testHost: boolean;
  isInternal: boolean;
  internalLabel: string | null;
  markedTest: boolean;
  events: number;
  greetings: number;
};

export type AdminEvent = {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  createdAt: string;
  hostEmail: string;
  hostTest: boolean;
  guests: number;
  attending: number;
};

export type AdminVideoOrder = {
  id: string;
  eventId: string;
  eventTitle: string;
  hostEmail: string;
  tier: string;
  status: string;
  provider: string | null;
  priceCents: number;
  testMode: boolean;
  refundNeeded: boolean;
  stripePaymentIntent: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  paidAt: string | null;
};

const qs = (q?: string) => (q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "");

export const adminOverview = () => hostFetch<AdminOverview>("/admin/overview");
export const adminUsers = (q?: string) => hostFetch<{ users: AdminUser[] }>(`/admin/users${qs(q)}`);
export const adminEvents = (q?: string) => hostFetch<{ events: AdminEvent[] }>(`/admin/events${qs(q)}`);
export const adminVideoOrders = (refundNeeded = false) =>
  hostFetch<{ orders: AdminVideoOrder[] }>(`/admin/video-invites${refundNeeded ? "?refundNeeded=1" : ""}`);
export const adminSetFlags = (
  id: string,
  flags: { isInternal?: boolean; internalLabel?: string | null; markedTest?: boolean },
) => hostFetch(`/admin/users/${id}/flags`, { method: "POST", body: JSON.stringify(flags) });
export const adminMarkRefunded = (id: string) => hostFetch(`/admin/video-invites/${id}/refunded`, { method: "POST" });

// --- Cash gifts (CASH_GIFTS in the API; 404 = not available to this account) --

export type GiftAccount = {
  /** live = real money; test = Stripe TEST mode (admin testing as host / test host). */
  mode: "live" | "test";
  status: "none" | "needs_info" | "pending" | "ready";
  available: boolean;
  reason?: "test_unavailable" | "not_configured";
};

export type EventGift = {
  id: string;
  guestName: string | null;
  guestMessage: string | null;
  amountCents: number;
  status: string;
  testMode: boolean;
  paidAt: string | null;
};

export type EventGifts = {
  enabled: boolean;
  suggestedCents: number[];
  message: string | null;
  limits: { minCents: number; maxCents: number; eventDailyCapCents: number };
  receivedCents: number;
  gifts: EventGift[];
};

/** Null when cash gifts are switched off for this account (the API answers 404). */
export async function getGiftAccount(): Promise<GiftAccount | null> {
  try {
    return await hostFetch<GiftAccount>("/gifts/account");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const startGiftOnboarding = (eventId: string) =>
  hostFetch<{ url: string }>("/gifts/account/onboard", { method: "POST", body: JSON.stringify({ eventId }) });

export const openGiftDashboard = () => hostFetch<{ url: string }>("/gifts/account/dashboard", { method: "POST" });

export const getEventGifts = (eventId: string) => hostFetch<EventGifts>(`/events/${eventId}/gifts`);

export const updateEventGifts = (
  eventId: string,
  patch: { enabled?: boolean; suggestedCents?: number[]; message?: string | null },
) => hostFetch<{ enabled: boolean }>(`/events/${eventId}/gifts`, { method: "PATCH", body: JSON.stringify(patch) });

export type AdminGift = {
  id: string;
  eventTitle: string;
  hostEmail: string;
  guestName: string | null;
  amountCents: number;
  platformFeeCents: number;
  totalCents: number;
  status: string;
  testMode: boolean;
  stripePaymentIntent: string | null;
  destinationAccount: string;
  createdAt: string;
  paidAt: string | null;
  disputedAt: string | null;
};

export const adminGifts = () => hostFetch<{ gifts: AdminGift[] }>("/admin/gifts");
