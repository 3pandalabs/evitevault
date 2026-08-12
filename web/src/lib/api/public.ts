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
  // The flattened card from the designer, when the host has saved one. Used as
  // the link-preview image; the page itself renders live HTML, not this.
  cardImageUrl: string | null;
  // Set once the host has an album to point guests at, usually after the day.
  photoAlbumUrl: string | null;
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
    // Built-in cover artwork, drawn client-side in this palette when the host
    // has not uploaded a photo of their own.
    art: string;
  };
  rsvp: {
    deadline: string | null;
    closed: boolean;
    // The event's effective finish: the host's `endsAt`, or `startsAt` + 3
    // hours when they never set one. Decided by the API — never recomputed
    // here, where the guest's own clock would be the input.
    endedAt: string;
    ended: boolean;
    closedReason: "event_ended" | "deadline" | null;
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
  // Present only when the page was opened through a host preview link, which
  // is the one way an unpublished invitation is ever served.
  preview?: { status: string };
  you: {
    id: string;
    name: string;
    email: string | null;
    rsvpStatus: "pending" | "attending" | "declined" | "maybe";
    plusOnes: number;
    plusOneNames: string[] | null;
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
export async function fetchPublicEvent(
  slug: string,
  token?: string,
  previewToken?: string,
): Promise<PublicEvent | null> {
  const params = new URLSearchParams();
  if (token) params.set("t", token);
  // The only way an unpublished invitation is served. Signed, event-scoped and
  // two hours old at most — see the API's /events/:id/preview-link.
  if (previewToken) params.set("p", previewToken);
  const qs = params.toString() ? `?${params}` : "";
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
