import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

// R2 is S3-compatible; the AWS SDK v3 client works against it unchanged by
// pointing endpoint at the account's R2 endpoint and using region "auto".
export const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  // Required for presigned PUTs. Since v3.729 the SDK defaults this to
  // "WHEN_SUPPORTED", which computes an x-amz-checksum-crc32 at *signing* time —
  // when there is no body yet — and bakes CRC32("") into the signed query
  // string. The browser then PUTs real bytes and R2 rejects the mismatch. The
  // signature already pins bucket, key and content type, so dropping the
  // checksum costs no integrity we were relying on.
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

// Only these land in a browser <img>; anything else a guest tries to upload is
// rejected before a presigned URL is issued. Enforced again by ContentType
// being pinned into the signature below, so the client can't sign for image/png
// and then PUT an HTML file (which would otherwise be servable from the bucket
// domain if one is ever attached).
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export function isAllowedImageType(t: string): t is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(t);
}

export function presignUpload(key: string, contentType: AllowedImageType): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export function presignDownload(key: string): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

// Best-effort delete — called when a cover image is replaced or a guestbook
// post is removed, so the object doesn't outlive its metadata row.
export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

// ---------------------------------------------------------------------------
// Key layout. Every key is prefixed by the resource that owns it, so an
// authorization check is a string comparison and never a bucket listing:
//
//   events/<eventId>/cover/<uuid>.<ext>         host-uploaded cover art
//   events/<eventId>/guestbook/<uuid>.<ext>     guest-uploaded wall photos
//   templates/<templateKey>/preview.<ext>       shipped template previews
//
// A host may presign under events/<id>/ only for an event they own; a guest may
// presign under events/<id>/guestbook/ only for a published event they hold a
// link to. Both checks live in the routes — this module never authorizes.
// ---------------------------------------------------------------------------

export function coverImageKey(eventId: string, ext: string): string {
  return `events/${eventId}/cover/${crypto.randomUUID()}.${ext}`;
}

export function guestbookImageKey(eventId: string, ext: string): string {
  return `events/${eventId}/guestbook/${crypto.randomUUID()}.${ext}`;
}

export function extForType(t: AllowedImageType): string {
  return t === "image/jpeg" ? "jpg" : t.slice("image/".length);
}

// Guards against a caller passing an arbitrary key to presign-download and
// reading someone else's object. Returns the event id a key belongs to, or null
// if the key isn't in a shape this app ever produces.
export function eventIdForKey(key: string): string | null {
  const m = /^events\/([0-9a-f-]{36})\//i.exec(key);
  return m ? m[1] : null;
}
