"use client";

import { ImagePlus, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiError, postGuestbookEntry, uploadGuestbookPhoto } from "@/lib/api/browser";
import type { GuestbookPost } from "@/lib/api/public";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

// Must match ALLOWED_IMAGE_TYPES in api/src/plugins/r2.ts — the API rejects
// anything else, so filtering here just avoids a pointless round trip.
const ACCEPTED = "image/jpeg,image/png,image/webp,image/avif";
const MAX_BYTES = 10 * 1024 * 1024;

export function Guestbook({
  slug,
  token,
  initialPosts,
  photosEnabled,
  knownName,
}: {
  slug: string;
  token?: string;
  initialPosts: GuestbookPost[];
  photosEnabled: boolean;
  knownName: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [posts, setPosts] = useState(initialPosts);
  const [authorName, setAuthorName] = useState(knownName ?? "");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;

    setSubmitting(true);
    setError(null);
    try {
      // The photo goes straight to R2 via a presigned PUT; only the resulting
      // key is sent to the API.
      const imageKey = file ? await uploadGuestbookPhoto(slug, file) : null;

      const created = await postGuestbookEntry(slug, {
        token,
        authorName: knownName ? undefined : authorName.trim(),
        body: body.trim() || null,
        imageKey,
      });

      // Optimistically prepend without the image URL: the presigned GET for a
      // just-uploaded object comes from the server on refresh, and minting one
      // client-side would mean a second round trip for something about to be
      // replaced anyway.
      setPosts((prev) => [{ ...created, imageUrl: null }, ...prev]);
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      setError(
        code === "photos_disabled"
          ? "The host has turned off photo uploads."
          : code === "author_name_required"
            ? "Please add your name."
            : "Couldn't post that. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="ev-heading text-xl font-semibold sm:text-2xl">Guestbook</h2>
      <p className="ev-muted mt-1 text-sm">Leave a message for the host and other guests.</p>

      <form onSubmit={onSubmit} className="ev-surface mt-4 space-y-3 rounded-2xl p-5 shadow-sm">
        {!knownName ? (
          <div className="space-y-1.5">
            <Label htmlFor="gb-name">Your name</Label>
            <Input
              id="gb-name"
              required
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
            />
          </div>
        ) : null}

        <Textarea
          aria-label="Your message"
          placeholder="Say something nice…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
        />

        <div className="flex flex-wrap items-center gap-3">
          {photosEnabled ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  // Checked client-side because R2 rejects an oversized PUT
                  // with an opaque error after the whole file has uploaded —
                  // a terrible experience on a phone connection.
                  if (f && f.size > MAX_BYTES) {
                    setError("That photo is larger than 10MB.");
                    e.target.value = "";
                    return;
                  }
                  setError(null);
                  setFile(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="border-black/15 bg-transparent text-[color:var(--ev-text)] hover:bg-black/5"
              >
                <ImagePlus className="size-4" />
                {file ? "Change photo" : "Add photo"}
              </Button>
              {file ? <span className="ev-muted text-xs">{file.name}</span> : null}
            </>
          ) : null}

          <Button
            type="submit"
            variant="themed"
            size="sm"
            className="ml-auto"
            disabled={submitting || (!body.trim() && !file)}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Post
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </form>

      <ul className="mt-6 space-y-4">
        {posts.map((post) => (
          <li key={post.id} className="ev-surface rounded-2xl p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{post.authorName}</span>
              <time className="ev-muted text-xs" dateTime={post.createdAt}>
                {new Date(post.createdAt).toLocaleDateString()}
              </time>
            </div>
            {post.body ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{post.body}</p>
            ) : null}
            {post.imageUrl ? (
              // Presigned URL, expires in minutes — see the note in page.tsx
              // for why next/image is not used here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.imageUrl}
                alt={`Photo from ${post.authorName}`}
                className="mt-3 w-full rounded-xl object-cover"
                loading="lazy"
              />
            ) : null}
          </li>
        ))}
        {posts.length === 0 ? (
          <li className="ev-muted py-6 text-center text-sm">No messages yet — be the first.</li>
        ) : null}
      </ul>
    </div>
  );
}
