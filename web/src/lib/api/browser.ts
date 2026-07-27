"use client";

// Browser-side calls go to the public, Cloudflare-proxied hostname. The
// orange-to-orange restriction that forces server-side code onto
// INTERNAL_API_URL does not apply here — a real browser is not a same-account
// Worker.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // Declared only when a body is actually sent — see the note in host.ts.
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    // The API answers with { error: "<code>" }; surface the code so callers can
    // map it to a specific message ("at_capacity" reads very differently from a
    // generic failure) without parsing prose.
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? "request_failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type RsvpInput = {
  token?: string;
  name?: string;
  email?: string | null;
  status: "attending" | "declined" | "maybe";
  plusOnes: number;
  plusOneNames?: string[];
  dietaryNotes?: string | null;
  message?: string | null;
};

export type RsvpResult = {
  ok: true;
  status: "attending" | "declined" | "maybe";
  plusOnes: number;
  plusOneNames: string[] | null;
  name: string;
  email: string | null;
  inviteToken?: string;
};

export function submitRsvp(slug: string, input: RsvpInput) {
  return request<RsvpResult>(`/public/events/${encodeURIComponent(slug)}/rsvp`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type GuestbookInput = {
  token?: string;
  authorName?: string;
  body?: string | null;
  imageKey?: string | null;
  // Contact address only. Attendance belongs to the RSVP form — collecting it
  // here as well meant two write paths into the same guest data.
  email?: string | null;
};

export function postGuestbookEntry(slug: string, input: GuestbookInput) {
  return request<{
    id: string;
    authorName: string;
    body: string | null;
    createdAt: string;
  }>(`/public/events/${encodeURIComponent(slug)}/guestbook`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Two steps: ask the API for a presigned PUT, then upload straight to R2. The
// file never passes through the API, which is what keeps a 10MB photo from
// occupying a Fastify worker for the duration of a phone's upload.
export async function uploadGuestbookPhoto(slug: string, file: File): Promise<string> {
  const { key, uploadUrl } = await request<{ key: string; uploadUrl: string }>(
    `/public/events/${encodeURIComponent(slug)}/guestbook/presign-upload`,
    { method: "POST", body: JSON.stringify({ contentType: file.type }) },
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    // Must match the content type pinned into the signature, or R2 rejects it.
    headers: { "content-type": file.type },
    body: file,
  });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");

  return key;
}
