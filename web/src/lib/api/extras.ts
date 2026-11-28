"use client";

import { API_URL, ApiError } from "./browser";
import { getTokens, hostFetch, type GuestRow, type RsvpQuestion } from "./host";

// Host calls for the free host features (API routes/extras.ts, migration
// 0015). Kept out of host.ts so the cash-gifts work there never collides.

export type MailOutcome = {
  emailed: number;
  emailsFailed: number;
  testNotSent: number;
  quotaExhausted: boolean;
  emailConfigured: boolean;
};

/** One sentence about what happened to the email, for the host. */
export function mailNote(r: MailOutcome, who = "them"): string {
  if (r.testNotSent) return `Test mode: email to ${who} not sent.`;
  if (!r.emailConfigured) return `Email isn't set up, so ${who} weren't emailed — let ${who} know yourself.`;
  if (r.quotaExhausted) return `Today's email limit is used up, so ${who} weren't emailed — let ${who} know another way.`;
  if (r.emailsFailed) return `${r.emailsFailed} email${r.emailsFailed === 1 ? "" : "s"} didn't go out.`;
  if (r.emailed) return `Emailed ${r.emailed === 1 ? who : `${r.emailed} people`}.`;
  return "";
}

// --- waitlist ----------------------------------------------------------------
export const decideGuest = (eventId: string, guestId: string, decision: "approve" | "decline") =>
  hostFetch<{ guest: GuestRow } & MailOutcome>(`/events/${eventId}/guests/${guestId}/${decision}`, { method: "POST" });

// --- questions -----------------------------------------------------------------
export const saveQuestions = (eventId: string, questions: RsvpQuestion[]) =>
  hostFetch<{ questions: RsvpQuestion[] }>(`/events/${eventId}/questions`, {
    method: "PUT",
    body: JSON.stringify({ questions }),
  });

// --- co-hosts ------------------------------------------------------------------
export type Cohost = {
  id: string;
  name: string;
  email: string;
  status: "invited" | "accepted";
  invitedAt: string;
  acceptedAt: string | null;
  acceptUrl: string | null;
};

export const listCohosts = (eventId: string) =>
  hostFetch<{ myRole: "owner" | "cohost"; cohosts: Cohost[] }>(`/events/${eventId}/cohosts`);

export const inviteCohost = (eventId: string, input: { name: string; email: string }) =>
  hostFetch<{ cohost: Cohost; acceptUrl: string } & MailOutcome>(`/events/${eventId}/cohosts`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const removeCohost = (eventId: string, cohostId: string) =>
  hostFetch<void>(`/events/${eventId}/cohosts/${cohostId}`, { method: "DELETE" });

export type CohostInvite = {
  eventId: string;
  title: string;
  startsAt: string;
  timezone: string;
  status: "invited" | "accepted";
  invitedEmailHint: string;
  problem: "already_accepted" | "email_mismatch" | "owner_cannot_cohost" | null;
  alreadyYours: boolean;
};

export const getCohostInvite = (token: string) => hostFetch<CohostInvite>(`/cohost-invites/${token}`);
export const acceptCohostInvite = (token: string) =>
  hostFetch<{ eventId: string }>(`/cohost-invites/${token}/accept`, { method: "POST" });

// --- potluck -------------------------------------------------------------------
export type HostPotluckItem = {
  id: string;
  name: string;
  note: string | null;
  quantity: number;
  claimed: number;
  claims: { guestId: string; name: string; quantity: number }[];
};

export const getPotluck = (eventId: string) =>
  hostFetch<{ enabled: boolean; items: HostPotluckItem[] }>(`/events/${eventId}/potluck`);
export const addPotluckItem = (eventId: string, item: { name: string; note?: string | null; quantity: number }) =>
  hostFetch<{ items: HostPotluckItem[] }>(`/events/${eventId}/potluck/items`, { method: "POST", body: JSON.stringify(item) });
export const updatePotluckItem = (eventId: string, itemId: string, patch: { name?: string; note?: string | null; quantity?: number }) =>
  hostFetch<{ items: HostPotluckItem[] }>(`/events/${eventId}/potluck/items/${itemId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deletePotluckItem = (eventId: string, itemId: string) =>
  hostFetch<{ items: HostPotluckItem[] }>(`/events/${eventId}/potluck/items/${itemId}`, { method: "DELETE" });

// --- date poll -----------------------------------------------------------------
export type HostPoll = {
  status: "open" | "closed" | null;
  closedAt: string | null;
  options: {
    id: string;
    startsAt: string;
    endsAt: string | null;
    tally: { yes: number; maybe: number; no: number; score: number };
    voters: { name: string; answer: "yes" | "maybe" | "no" }[];
  }[];
  ranking: string[];
  voterCount: number;
};

export const getPoll = (eventId: string) => hostFetch<HostPoll>(`/events/${eventId}/poll`);
export const savePoll = (eventId: string, options: { startsAt: string; endsAt?: string | null }[]) =>
  hostFetch<HostPoll>(`/events/${eventId}/poll`, { method: "PUT", body: JSON.stringify({ options }) });
export const cancelPoll = (eventId: string) => hostFetch<void>(`/events/${eventId}/poll`, { method: "DELETE" });
export const pickPollOption = (eventId: string, optionId: string, notify: boolean) =>
  hostFetch<{ notified: number } & MailOutcome>(`/events/${eventId}/poll/pick`, {
    method: "POST",
    body: JSON.stringify({ optionId, notify }),
  });

// --- shared album --------------------------------------------------------------
export type HostAlbum = {
  enabled: boolean;
  guestUploads: boolean;
  max: number;
  photos: { id: string; url: string; uploaderName: string | null; byGuest: boolean; sizeBytes: number; createdAt: string }[];
};

export const getAlbum = (eventId: string) => hostFetch<HostAlbum>(`/events/${eventId}/album`);
export const deleteAlbumPhoto = (eventId: string, photoId: string) =>
  hostFetch<void>(`/events/${eventId}/album/photos/${photoId}`, { method: "DELETE" });

export async function uploadAlbumPhotoAsHost(eventId: string, blob: Blob): Promise<void> {
  const { key, uploadUrl } = await hostFetch<{ key: string; uploadUrl: string }>(`/events/${eventId}/album/presign`, {
    method: "POST",
    body: JSON.stringify({ contentType: blob.type, size: blob.size }),
  });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": blob.type }, body: blob });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");
  await hostFetch(`/events/${eventId}/album/photos`, { method: "POST", body: JSON.stringify({ key }) });
}

/** "Download all": the zip needs the Authorization header, so fetch it as a blob. */
export async function downloadAlbumZip(eventId: string, slug: string, retried = false): Promise<void> {
  const res = await fetch(`${API_URL}/events/${eventId}/album.zip`, {
    headers: { authorization: `Bearer ${getTokens().access ?? ""}` },
  });
  if (res.status === 401 && !retried) {
    // Refresh via a cheap authenticated call, then retry once.
    await hostFetch(`/events/${eventId}/album`);
    return downloadAlbumZip(eventId, slug, true);
  }
  if (!res.ok) throw new ApiError(res.status, "download_failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `album-${slug}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
