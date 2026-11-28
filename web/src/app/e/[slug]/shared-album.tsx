"use client";

import { Camera, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { deleteMyAlbumPhoto, listAlbum, uploadAlbumPhoto, type AlbumPhoto } from "@/lib/api/guestExtras";
import type { PublicExtras } from "@/lib/api/public";
import { resizeForAlbum } from "@/lib/resizeImage";

const ERRORS: Record<string, string> = {
  album_full: "The album is full.",
  too_large: "That photo is too large.",
  unsupported_content_type: "Only JPEG, PNG or WebP photos can be added.",
  unsupported_image: "That photo couldn't be read — try a JPEG.",
  invitation_required: "Use your personal invitation link to add photos.",
  guest_uploads_off: "The host isn't taking photos from guests right now.",
};

// The shared album on the invitation: only people holding the invitation
// link can see it (the API serves short-lived links, and the page itself is
// never indexed). Guests add photos with their personal link; each photo is
// shrunk in the browser first.
export function SharedAlbum({ slug, token, album }: { slug: string; token?: string; album: NonNullable<PublicExtras["album"]> }) {
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AlbumPhoto | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listAlbum(slug, token).then((p) => live && setPhotos(p));
    return () => {
      live = false;
    };
  }, [slug, token]);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !token) return;
    const list = Array.from(files).slice(0, Math.max(0, album.max - (photos?.length ?? 0)));
    setError(null);
    setUploading({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      try {
        const blob = await resizeForAlbum(list[i], album.maxBytes);
        await uploadAlbumPhoto(slug, token, blob);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : err instanceof Error ? err.message : "";
        setError(ERRORS[code] ?? "A photo couldn't be added. Please try again.");
        if (code === "album_full") break;
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    setPhotos(await listAlbum(slug, token));
    if (input.current) input.current.value = "";
  }

  async function remove(p: AlbumPhoto) {
    if (!token) return;
    try {
      await deleteMyAlbumPhoto(slug, token, p.id);
      setPhotos((ps) => ps?.filter((x) => x.id !== p.id) ?? null);
      setOpen(null);
    } catch {
      setError("Couldn't remove that photo.");
    }
  }

  const count = photos?.length ?? album.count;

  return (
    <section className="ev-surface mt-8 rounded-2xl p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
            <Camera className="size-5" style={{ color: "var(--ev-accent)" }} />
            Shared album
          </h2>
          <p className="ev-muted mt-1 text-sm">
            {count} photo{count === 1 ? "" : "s"} · only people with this invitation can see them.
          </p>
        </div>
        {album.canUpload && token ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading !== null || count >= album.max}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {uploading ? `Adding ${uploading.done + 1} of ${uploading.total}` : "Add photos"}
            </button>
          </>
        ) : album.guestUploads && !token ? (
          <p className="ev-muted text-xs">Open your personal invitation link to add photos.</p>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}

      {photos === null ? (
        <div className="mt-4 flex justify-center py-6">
          <Loader2 className="size-5 animate-spin opacity-50" />
        </div>
      ) : photos.length === 0 ? (
        <p className="ev-muted mt-4 text-sm">No photos yet{album.canUpload ? " — be the first." : "."}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)} className="block aspect-square w-full overflow-hidden rounded-lg bg-black/5">
                {/* Presigned, short-lived URL: a plain <img>, never next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.by ? `Photo from ${p.by}` : "Album photo"} loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between text-white">
            <span className="text-sm opacity-80">{open.by ? `From ${open.by}` : ""}</span>
            <div className="flex gap-2">
              {open.mine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(open);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm"
                >
                  <Trash2 className="size-4" /> Remove
                </button>
              ) : null}
              <button type="button" aria-label="Close" className="rounded-full bg-white/10 p-2">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
