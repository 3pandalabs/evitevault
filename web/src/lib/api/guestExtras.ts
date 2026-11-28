"use client";

import { API_URL, ApiError } from "./browser";
import type { PublicPoll, PublicPotluck } from "./public";

// Guest-side calls for the free host features (API routes/publicExtras.ts).
// Every write carries the guest's own invite token.

async function post<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, j?.error ?? "request_failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const ev = (slug: string) => `/public/events/${encodeURIComponent(slug)}`;

export const claimPotluck = (slug: string, itemId: string, token: string, quantity: number) =>
  post<{ potluck: PublicPotluck }>(`${ev(slug)}/potluck/${itemId}/claim`, { token, quantity });

export const votePoll = (slug: string, token: string, votes: { optionId: string; answer: "yes" | "maybe" | "no" }[]) =>
  post<{ poll: PublicPoll }>(`${ev(slug)}/poll/vote`, { token, votes });

export type AlbumPhoto = { id: string; url: string; by: string | null; mine: boolean; createdAt: string };

export async function listAlbum(slug: string, token?: string): Promise<AlbumPhoto[]> {
  const res = await fetch(`${API_URL}${ev(slug)}/album${token ? `?t=${token}` : ""}`, { cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()) as { photos: AlbumPhoto[] }).photos;
}

export async function uploadAlbumPhoto(slug: string, token: string, blob: Blob): Promise<void> {
  const { key, uploadUrl } = await post<{ key: string; uploadUrl: string }>(`${ev(slug)}/album/presign`, {
    token,
    contentType: blob.type,
    size: blob.size,
  });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": blob.type }, body: blob });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");
  await post(`${ev(slug)}/album/photos`, { token, key });
}

export const deleteMyAlbumPhoto = (slug: string, token: string, photoId: string) =>
  post<void>(`${ev(slug)}/album/photos/${photoId}?t=${token}`, undefined, "DELETE");
