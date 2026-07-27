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
        "content-type": "application/json",
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

export const listEvents = () => hostFetch<{ events: EventSummary[] }>("/events");
export const getEvent = (id: string) => hostFetch<EventSummary & Record<string, unknown>>(`/events/${id}`);
export const listGuests = (id: string) => hostFetch<{ guests: GuestRow[] }>(`/events/${id}/guests`);
export const getAnalytics = (id: string) => hostFetch<Analytics>(`/events/${id}/analytics`);

export const addGuests = (id: string, guests: { name: string; email?: string | null }[]) =>
  hostFetch<{ added: number; skipped: number }>(`/events/${id}/guests`, {
    method: "POST",
    body: JSON.stringify({ guests, markInvited: true }),
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
