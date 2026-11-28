"use client";

import { Camera, Download, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { deleteAlbumPhoto, downloadAlbumZip, getAlbum, uploadAlbumPhotoAsHost, type HostAlbum } from "@/lib/api/extras";
import { updateEvent } from "@/lib/api/host";
import { resizeForAlbum } from "@/lib/resizeImage";
import { Button } from "@/components/ui/button";
import { Panel } from "../../ui";

// The shared album stored with the invitation (free: 200 photos, 10 MB each,
// shrunk in the browser). Only people holding the invitation link see it.
export function AlbumManager({ eventId, slug, onChanged }: { eventId: string; slug: string; onChanged: (patch: { albumEnabled?: boolean; albumGuestUploads?: boolean }) => void }) {
  const [album, setAlbum] = useState<HostAlbum | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getAlbum(eventId)
      .then(setAlbum)
      .catch(() => setAlbum(null));
  }, [eventId]);
  useEffect(load, [load]);

  async function setFlag(patch: { albumEnabled?: boolean; albumGuestUploads?: boolean }) {
    setBusy("flag");
    try {
      await updateEvent(eventId, patch);
      onChanged(patch);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length || !album) return;
    setBusy("upload");
    setError(null);
    for (const f of Array.from(files).slice(0, album.max - album.photos.length)) {
      try {
        await uploadAlbumPhotoAsHost(eventId, await resizeForAlbum(f, 10 * 1024 * 1024));
      } catch (err) {
        setError(err instanceof ApiError && err.code === "album_full" ? "The album is full." : "A photo couldn't be added.");
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    load();
  }

  if (!album) return null;

  return (
    <Panel
      title="Shared album"
      icon={Camera}
      description={`Photos on the invitation page, visible only to people with the link. Up to ${album.max} photos.`}
      actions={
        album.photos.length ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy === "zip"}
            onClick={async () => {
              setBusy("zip");
              try {
                await downloadAlbumZip(eventId, slug);
              } catch {
                setError("Couldn't build the download.");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "zip" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download all
          </Button>
        ) : null
      }
    >
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" className="size-4 accent-zinc-900" checked={album.enabled} disabled={busy === "flag"} onChange={(e) => setFlag({ albumEnabled: e.target.checked })} />
          Show the album on the invitation
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" className="size-4 accent-zinc-900" checked={album.guestUploads} disabled={busy === "flag" || !album.enabled} onChange={(e) => setFlag({ albumGuestUploads: e.target.checked })} />
          Guests can add photos (with their personal link)
        </label>
      </div>

      {album.enabled ? (
        <div className="mt-4">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button size="sm" className="rounded-full" disabled={busy === "upload" || album.photos.length >= album.max} onClick={() => input.current?.click()}>
            {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Add photos
          </Button>
          <span className="ml-3 text-sm text-zinc-500">
            {album.photos.length}/{album.max}
          </span>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {album.photos.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {album.photos.map((p) => (
            <li key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.uploaderName ? `From ${p.uploaderName}` : "Album photo"} loading="lazy" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={async () => {
                  if (!window.confirm("Remove this photo from the album?")) return;
                  await deleteAlbumPhoto(eventId, p.id).catch(() => undefined);
                  load();
                }}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white"
              >
                <Trash2 className="size-3.5" />
              </button>
              {p.uploaderName ? <span className="absolute inset-x-0 bottom-0 truncate bg-black/40 px-1.5 py-0.5 text-[10px] text-white">{p.uploaderName}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
