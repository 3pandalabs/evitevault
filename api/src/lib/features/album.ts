// Shared photo album (migration 0015). Pure caps and access rules, tested in
// album.test.ts.
//
// - Free cap: ALBUM_MAX_PHOTOS per event, ALBUM_MAX_BYTES each, images only.
//   The browser resizes before upload (web lib/resizeImage.ts), so most
//   photos are well under the cap; the cap is enforced again by the presigned
//   PUT (Content-Length signed in) and by a HEAD on the stored object before
//   the row is written.
// - Who sees it: only someone holding the invitation link (the slug) of a
//   published event with the album on. Photos are served as 10-minute
//   presigned URLs, never public bucket URLs.
// - Who adds: the host / co-hosts always; a guest only with their personal
//   invite token and only while the host allows guest uploads.
// - Who removes: the host / co-hosts (any photo); a guest their own.

export const ALBUM_MAX_PHOTOS = 200;
export const ALBUM_MAX_BYTES = 10 * 1024 * 1024;
export const ALBUM_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AlbumEvent = { status: string; albumEnabled: boolean; albumGuestUploads: boolean };

export function albumVisible(ev: AlbumEvent): boolean {
  return ev.status === "published" && ev.albumEnabled;
}

export type UploadProblem =
  | "album_disabled"
  | "guest_uploads_off"
  | "invitation_required"
  | "album_full"
  | "too_large"
  | "unsupported_content_type";

export function uploadProblem(input: {
  event: AlbumEvent;
  uploader: "host" | "guest";
  hasGuestToken: boolean;
  currentCount: number;
  sizeBytes: number;
  contentType: string;
}): UploadProblem | null {
  const { event } = input;
  if (input.uploader === "guest") {
    if (!albumVisible(event)) return "album_disabled";
    if (!event.albumGuestUploads) return "guest_uploads_off";
    if (!input.hasGuestToken) return "invitation_required";
  } else if (!event.albumEnabled) {
    return "album_disabled";
  }
  if (!(ALBUM_TYPES as readonly string[]).includes(input.contentType)) return "unsupported_content_type";
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > ALBUM_MAX_BYTES) return "too_large";
  if (input.currentCount >= ALBUM_MAX_PHOTOS) return "album_full";
  return null;
}

/** A confirmed key must be one minted for this event's album prefix. */
export function isAlbumKeyFor(eventId: string, key: string): boolean {
  return new RegExp(`^events/${eventId}/album/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").test(key);
}

export function canRemovePhoto(
  photo: { guestId: string | null },
  actor: { kind: "manager" } | { kind: "guest"; guestId: string },
): boolean {
  if (actor.kind === "manager") return true;
  return photo.guestId !== null && photo.guestId === actor.guestId;
}
