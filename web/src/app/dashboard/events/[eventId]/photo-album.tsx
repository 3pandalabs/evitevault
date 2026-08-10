"use client";

import { Copy, ExternalLink, Images, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { sharePhotoAlbum } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";

type Audience = "all" | "attending";

/**
 * The photo album a host shares after the day: the link lives on the event
 * (set on the edit form), and this is where it gets sent to everyone.
 *
 * Sending is a separate, explicit action rather than something that happens
 * when the link is saved — a host pastes the album in while still sorting
 * through pictures, and a broadcast that fired on save would go out half
 * finished, to a list that can't be unsent to.
 */
export function PhotoAlbumCard({
  eventId,
  albumUrl,
  recipientCounts,
}: {
  eventId: string;
  albumUrl: string | null;
  recipientCounts: { all: number; attending: number };
}) {
  const [audience, setAudience] = useState<Audience>("attending");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await sharePhotoAlbum(eventId, { audience, message: message.trim() || null });
      if (res.recipientCount === 0) {
        setResult({
          ok: false,
          text: "Nobody in that group has an email address, so nothing was sent.",
        });
      } else if (!res.emailConfigured) {
        setResult({
          ok: false,
          text: "Email isn't set up for this app yet, so nothing was sent — share the link yourself instead.",
        });
      } else {
        const failed = res.failed > 0 ? ` ${res.failed} failed.` : "";
        setResult({
          ok: res.delivered > 0,
          text: `Emailed the album to ${res.delivered} of ${res.recipientCount} guest${
            res.recipientCount === 1 ? "" : "s"
          }.${failed}`,
        });
      }
    } catch {
      setResult({ ok: false, text: "Couldn't send that. Try again in a moment." });
    } finally {
      setSending(false);
    }
  }

  const count = recipientCounts[audience];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Images className="size-4 text-slate-400" />
          Photo album
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!albumUrl ? (
          <>
            <p className="text-sm text-slate-600">
              Make a shared album in Google Photos, turn on collaboration so guests can add their
              own pictures, then paste the link into this event. It shows on the invitation, and
              you can email it to everyone from here.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="https://photos.google.com/albums" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="size-3.5" />
                  Open Google Photos
                </Button>
              </a>
              <Link href={`/dashboard/events/${eventId}/edit`}>
                <Button size="sm">Add the album link</Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {albumUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(albumUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <a href={albumUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm">
                  <ExternalLink className="size-3.5" />
                  Open
                </Button>
              </a>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="album-message">Message (optional)</Label>
              <Textarea
                id="album-message"
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Thank you all for coming — here are the pictures."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="album-audience">Send to</Label>
              <select
                id="album-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="flex h-10 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {/* Attending first and the default: the people in the photos
                    are the people who came, and mailing the album to everyone
                    who declined is a small act of gloating. */}
                <option value="attending">
                  Guests who came ({recipientCounts.attending} with email)
                </option>
                <option value="all">Everyone invited ({recipientCounts.all} with email)</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={sending || count === 0} onClick={onSend}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Email the album link
              </Button>
              {count === 0 ? (
                <span className="text-sm text-slate-500">
                  Nobody in that group has an email address.
                </span>
              ) : null}
            </div>

            {result ? (
              <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {result.text}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
