"use client";

// Shrinks a photo in the browser before it is uploaded to the shared album:
// longest side at most MAX_SIDE px, re-encoded as JPEG. A phone photo goes
// from ~4-8 MB to a few hundred KB, which keeps the free 10 MB cap and the
// guest's mobile data out of each other's way. PNG/WebP that are already
// small are passed through untouched.

const MAX_SIDE = 2048;
const QUALITY = 0.85;

export async function resizeForAlbum(file: File, maxBytes: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not_an_image");
  const small = file.size <= 1_500_000 && ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formats the browser cannot decode (e.g. HEIC on some desktops).
    if (small) return file;
    throw new Error("unsupported_image");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && small) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unsupported_image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  if (!blob) throw new Error("unsupported_image");
  if (blob.size > maxBytes) throw new Error("too_large");
  return blob;
}
