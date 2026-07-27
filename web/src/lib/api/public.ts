import "server-only";

// Server-side base URL. INTERNAL_API_URL points at the DNS-only hostname —
// required because Cloudflare rejects a same-account Worker fetching a proxied
// hostname ("orange-to-orange") before any WAF rule can allow it. It is not
// NEXT_PUBLIC_-prefixed, so it is undefined in the browser bundle and
// browser-side code correctly uses the public host instead.
const API_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type PublicEvent = {
  slug: string;
  title: string;
  description: string | null;
  hostName: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  location: { name: string | null; address: string | null; mapUrl: string | null };
  coverImageUrl: string | null;
  theme: {
    palette: {
      bg: string;
      surface: string;
      text: string;
      muted: string;
      accent: string;
      accentText: string;
    };
    fonts: { heading: string; body: string };
    layout: "classic" | "poster" | "minimal" | "photo";
  };
  rsvp: {
    deadline: string | null;
    closed: boolean;
    atCapacity: boolean;
    allowPlusOnes: boolean;
    maxPlusOnes: number;
    collectDietary: boolean;
    canRespond: boolean;
    requiresToken: boolean;
  };
  guestbook: { enabled: boolean; photosEnabled: boolean };
  attending: {
    count: number;
    headcount: number;
    attendees: { name: string; plusOnes: number }[] | null;
  };
  calendar: { icsUrl: string; googleUrl: string };
  you: {
    id: string;
    name: string;
    email: string | null;
    rsvpStatus: "pending" | "attending" | "declined" | "maybe";
    plusOnes: number;
    dietaryNotes: string | null;
    message: string | null;
    respondedAt: string | null;
  } | null;
};

export type GuestbookPost = {
  id: string;
  authorName: string;
  body: string | null;
  imageUrl: string | null;
  createdAt: string;
};

// `cache: "no-store"` throughout: an invitation shows a live RSVP count and
// presigned image URLs that expire in ten minutes. A cached render would show
// a stale headcount and, worse, broken images.
export async function fetchPublicEvent(slug: string, token?: string): Promise<PublicEvent | null> {
  const qs = token ? `?t=${encodeURIComponent(token)}` : "";
  const res = await fetch(`${API_URL}/public/events/${encodeURIComponent(slug)}${qs}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`invitation fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchGuestbook(slug: string): Promise<GuestbookPost[]> {
  const res = await fetch(`${API_URL}/public/events/${encodeURIComponent(slug)}/guestbook`, {
    cache: "no-store",
  });
  // The wall is secondary content — a failure here shouldn't take down the
  // whole invitation, so it degrades to empty rather than throwing.
  if (!res.ok) return [];
  const data = (await res.json()) as { posts: GuestbookPost[] };
  return data.posts;
}
