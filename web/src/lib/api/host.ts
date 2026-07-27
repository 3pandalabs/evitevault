"use client";

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
  status: "draft" | "published" | "cancelled" | "archived";
  capacity: number | null;
  invited: number;
  attending: number;
  declined: number;
  maybe: number;
  pending: number;
  headcount: number;
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
  };
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
};

export const listTemplates = () => hostFetch<{ templates: Template[] }>("/templates");

export const createEvent = (input: EventInput) =>
  hostFetch<{ id: string; slug: string }>("/events", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateEvent = (id: string, patch: Partial<EventInput> & { coverImageKey?: string | null }) =>
  hostFetch<EventSummary>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const publishEvent = (id: string) =>
  hostFetch<EventSummary>(`/events/${id}/publish`, { method: "POST" });

export const deleteEvent = (id: string) => hostFetch<void>(`/events/${id}`, { method: "DELETE" });

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
    emailConfigured: boolean;
  }>(`/events/${id}/guests`, {
    method: "POST",
    body: JSON.stringify({ guests, markInvited: true, sendInvites: true }),
  });

export const sendInvitations = (id: string, includeResponded = false) =>
  hostFetch<{
    recipients: number;
    delivered: number;
    failed: number;
    emailConfigured: boolean;
  }>(`/events/${id}/guests/send-invitations`, {
    method: "POST",
    body: JSON.stringify({ includeResponded }),
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
