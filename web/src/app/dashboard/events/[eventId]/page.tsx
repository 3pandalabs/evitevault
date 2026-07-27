"use client";

import { Copy, Download, Eye, ImagePlus, Loader2, Mail, Plus, Send, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addGuests,
  downloadGuestCsv,
  getAnalytics,
  getEvent,
  listGuests,
  publishEvent,
  sendInvitations,
  uploadCoverImage,
  type Analytics,
  type EventSummary,
  type GuestRow,
} from "@/lib/api/host";
import { ApiError } from "@/lib/api/browser";
import { Badge, rsvpVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { EventQrCode } from "./qr-code";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkGuests, setBulkGuests] = useState("");
  const [addingGuests, setAddingGuests] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);


  const load = useCallback(async () => {
    try {
      // Three independent reads — run them together rather than waterfalling,
      // the detail view is useless until all three land anyway.
      const [ev, gs, an] = await Promise.all([
        getEvent(eventId),
        listGuests(eventId),
        getAnalytics(eventId),
      ]);
      setEvent(ev as unknown as EventSummary);
      setGuests(gs.guests);
      setAnalytics(an);
    } catch {
      setError("Couldn't load this event.");
    }
  }, [eventId]);

  useEffect(() => {
    // react-hooks/set-state-in-effect can't see that load() awaits before its
    // first setState — the rule targets synchronous cascading renders, and
    // there are none here. Fetching on mount is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function onPublish() {
    setPublishing(true);
    setError(null);
    try {
      await publishEvent(eventId);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "incomplete_event") {
        setError("Add a title and a date before publishing.");
      } else {
        setError("Couldn't publish this event.");
      }
    } finally {
      setPublishing(false);
    }
  }

  async function onResend() {
    setResending(true);
    setError(null);
    setAddResult(null);
    try {
      const res = await sendInvitations(eventId);
      if (!res.emailConfigured) {
        setAddResult("Email isn't set up yet, so nothing was sent — share the link or QR code instead.");
      } else {
        const failed = res.failed > 0 ? ` ${res.failed} failed.` : "";
        setAddResult(`Emailed ${res.delivered} of ${res.recipients} who hadn't replied.${failed}`);
      }
      await load();
    } catch {
      setError("Couldn't send those invitations.");
    } finally {
      setResending(false);
    }
  }

  async function onAddGuests() {
    setAddingGuests(true);
    setError(null);
    setAddResult(null);
    try {
      // "Name, email" per line, email optional — a guest with no address is
      // legitimate (invited by hand, or over the phone), and the API only
      // requires a name.
      const parsed = bulkGuests
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, email] = line.split(",").map((s) => s.trim());
          return { name, email: email || null };
        })
        .filter((g) => g.name);

      if (parsed.length === 0) return;

      const res = await addGuests(eventId, parsed);
      setBulkGuests("");

      // Say plainly what happened to the email, rather than letting "Added 5"
      // imply five invitations went out when none did.
      const parts = [`Added ${res.added}.`];
      if (res.skipped > 0) parts.push(`Skipped ${res.skipped} already on the list.`);
      if (!res.emailConfigured) {
        parts.push("Email isn't set up yet, so no invitations were sent — share the link or QR code.");
      } else if (event?.status !== "published") {
        parts.push("Publish the event to send invitations.");
      } else if (res.emailed > 0) {
        parts.push(`Emailed ${res.emailed}.`);
      }
      if (res.emailsFailed > 0) parts.push(`${res.emailsFailed} email(s) failed.`);
      setAddResult(parts.join(" "));
      await load();
    } catch {
      setError("Couldn't add those guests.");
    } finally {
      setAddingGuests(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!event || !analytics) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const invitationUrl = `${SITE_URL}/e/${event.slug}`;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            {event.status !== "published" ? <Badge variant="outline">{event.status}</Badge> : null}
          </div>
          {event.status === "published" ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-slate-100 px-2 py-1 text-xs">{invitationUrl}</code>
              <Button variant="ghost" size="sm" onClick={() => copy(invitationUrl, "link")}>
                <Copy className="size-3.5" />
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              This is a draft — the link doesn&apos;t work for guests until you publish it.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {event.status !== "published" ? (
            <Button onClick={onPublish} disabled={publishing}>
              {publishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Publish
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => downloadGuestCsv(eventId, event.slug)}>
            <Download className="size-4" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* Only for a published event — a QR pointing at a draft would scan to a
          404, and printing one is the sort of mistake you find out about from a
          guest standing in your hallway. */}
      {event.status === "published" ? (
        <>
          <EventQrCode url={invitationUrl} slug={event.slug} />
          {event.allowPublicRsvp === false ? (
            <p className="-mt-3 text-sm text-amber-700">
              This event is invitation-only, so scanning the code shows the invitation but
              can&apos;t be used to reply. Turn on &ldquo;anyone with the link can RSVP&rdquo;, or share
              each guest&apos;s personal link instead.
            </p>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="size-4 text-slate-400" />
            Cover image
          </CardTitle>
          <div>
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError(null);
                try {
                  await uploadCoverImage(eventId, file);
                  await load();
                } catch {
                  setError("Couldn't upload that image.");
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => coverRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
              {event.coverImageKey ? "Replace" : "Upload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            {event.coverImageKey
              ? "A cover image is set. Replacing it deletes the old one."
              : "Optional. JPEG, PNG, WebP or AVIF, up to 10MB."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite guests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* One textarea rather than a repeating row form: hosts arrive with a
              list already written down somewhere, and retyping it into
              individual fields is the friction that stops them inviting anyone. */}
          <Textarea
            rows={4}
            value={bulkGuests}
            onChange={(e) => setBulkGuests(e.target.value)}
            placeholder={"One per line:\nMeera Iyer, meera@example.com\nSanjay Rao"}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={addingGuests || !bulkGuests.trim()} onClick={onAddGuests}>
              {addingGuests ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add guests
            </Button>
            {/* Separate from adding, so a re-paste of the same list can't
                re-mail everyone. Only goes to guests who haven't replied. */}
            {event.status === "published" && guests.some((g) => g.email && g.rsvpStatus === "pending") ? (
              <Button size="sm" variant="outline" disabled={resending} onClick={onResend}>
                {resending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Email guests who haven&apos;t replied
              </Button>
            ) : null}
          </div>
          {addResult ? <p className="text-sm text-slate-600">{addResult}</p> : null}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Going" value={`${analytics.rsvp.headcount}`} hint={`${analytics.rsvp.attending} responded yes`} />
        <Stat label="Awaiting reply" value={`${analytics.rsvp.pending}`} />
        <Stat
          label="Response rate"
          value={`${Math.round(analytics.responseRate * 100)}%`}
          hint={`${analytics.rsvp.invited} invited`}
        />
        <Stat
          label="Views"
          value={`${analytics.views.total}`}
          hint={`${analytics.views.uniqueVisitors} unique`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-slate-400" />
            Guest list
          </CardTitle>
          <span className="text-sm text-slate-500">{guests.length} guests</span>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No guests yet. Share the invitation link, or add guests to send personal invites.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">RSVP</th>
                    <th className="pb-2 pr-4 font-medium">Party</th>
                    <th className="pb-2 pr-4 font-medium">Notes</th>
                    <th className="pb-2 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => (
                    <tr key={g.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{g.name}</div>
                        {g.email ? <div className="text-xs text-slate-500">{g.email}</div> : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {g.rsvpStatus === "attending" ? 1 + g.plusOnes : "—"}
                      </td>
                      <td className="max-w-[16rem] py-3 pr-4 text-slate-600">
                        {[g.dietaryNotes, g.message].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {g.firstViewedAt ? (
                            <Eye className="size-3.5 text-slate-400" aria-label="Has opened the invitation" />
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copy(`${invitationUrl}?t=${g.inviteToken}`, g.id)
                            }
                          >
                            {copied === g.id ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
