"use client";

import {
  ArrowLeft,
  BellDot,
  CalendarDays,
  Copy,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addGuests,
  downloadGuestCsv,
  getAnalytics,
  getEvent,
  listGuests,
  markResponsesSeen,
  presignDownload,
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
import { formatEventDate, formatEventTime, formatTimeZoneLabel } from "@/lib/utils";
import { DeleteEventButton } from "../delete-event-button";
import { EventQrCode } from "./qr-code";
import { ShareButtons, GuestShareButtons, buildInviteMessage } from "./share";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Held with the key it was minted for, so a stale URL is never shown against
  // a newly replaced cover — see the derived `coverUrl` below.
  const [cover, setCover] = useState<{ key: string; url: string } | null>(null);
  const [bulkGuests, setBulkGuests] = useState("");
  const [addingGuests, setAddingGuests] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const seenClearedRef = useRef(false);
  // Captured on first load and held for the session: the server value is
  // cleared moments later, but the highlights should persist while the host is
  // still reading the page.
  //
  // State rather than a ref because it IS render data — which row gets a dot
  // depends on it. A ref read during render is the anti-pattern
  // react-hooks/refs exists to catch.
  const [seenBaseline, setSeenBaseline] = useState<string | null | undefined>(undefined);


  const load = useCallback(async () => {
    try {
      // Three independent reads — run them together rather than waterfalling,
      // the detail view is useless until all three land anyway.
      const [ev, gs, an] = await Promise.all([
        getEvent(eventId),
        listGuests(eventId),
        getAnalytics(eventId),
      ]);
      // Functional form so this only takes effect on the first load and
      // doesn't need to be a dependency of the callback.
      setSeenBaseline((prev) => (prev === undefined ? ev.responsesSeenAt ?? null : prev));
      setEvent(ev as unknown as EventSummary);
      setGuests(gs.guests);
      setAnalytics(an);

      // Clear the marker only AFTER rendering what was new, and only on the
      // first load — a refresh triggered by adding guests or publishing
      // shouldn't wipe responses the host hasn't actually read yet.
      if (!seenClearedRef.current && (ev.newResponses ?? 0) > 0) {
        seenClearedRef.current = true;
        markResponsesSeen(eventId).catch(() => {
          // Best effort. Failing to clear means they see the badge again,
          // which is a far better outcome than losing the event data because
          // a bookkeeping call failed.
        });
      }
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

  // The bucket is private, so the stored key has to be exchanged for a
  // short-lived read URL before it can go in an <img>. Keyed on coverImageKey
  // rather than the event, so replacing the image re-presigns and a plain
  // refresh doesn't. `cancelled` guards the case where the host replaces the
  // cover twice quickly and the first presign resolves last.
  const coverKey = event?.coverImageKey ?? null;
  useEffect(() => {
    if (!coverKey) return;
    let cancelled = false;
    presignDownload(coverKey)
      .then(({ url }) => {
        if (!cancelled) setCover({ key: coverKey, url });
      })
      .catch(() => {
        // Non-fatal: the caption below still says a cover is set, and the
        // guest-facing invitation renders it regardless of this preview.
      });
    return () => {
      cancelled = true;
    };
  }, [coverKey]);

  // Derived rather than cleared in the effect: a URL minted for the previous
  // key must not be rendered against the new one while its presign is in
  // flight, and clearing state synchronously inside an effect is what
  // react-hooks/set-state-in-effect exists to prevent.
  const coverUrl = cover && cover.key === coverKey ? cover.url : null;

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

  // Compared against the baseline captured on first load, not the live server
  // value — that gets cleared moments after the page renders, and the
  // highlights should stay put while the host is reading.
  const isNewResponse = (g: GuestRow) =>
    Boolean(g.respondedAt) &&
    (!seenBaseline || new Date(g.respondedAt!) > new Date(seenBaseline));
  const newResponses = guests.filter(isNewResponse).length;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to events
      </Link>

      {/* The page header doubles as the at-a-glance summary of the invitation:
          what it is, when and where, and how to reach it. Before, the date and
          location only appeared on the guest-facing page, so a host checking a
          detail had to open their own invitation to read it back. */}
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
              <Badge variant={event.status === "published" ? "attending" : "outline"}>
                {event.status}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-slate-400" />
                {formatEventDate(event.startsAt, event.timezone)}
                {" · "}
                {formatEventTime(event.startsAt, event.timezone)}
                <span className="text-slate-400">
                  {formatTimeZoneLabel(event.startsAt, event.timezone)}
                </span>
              </span>
              {event.locationName ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-slate-400" />
                  {event.locationName}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Users className="size-4 text-slate-400" />
                {event.headcount} attending
                {event.capacity ? ` of ${event.capacity}` : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {event.status !== "published" ? (
              <Button onClick={onPublish} disabled={publishing}>
                {publishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Publish
              </Button>
            ) : (
              <a href={invitationUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <Eye className="size-4" />
                  Preview
                </Button>
              </a>
            )}
            <Link href={`/dashboard/events/${eventId}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" />
                Edit
              </Button>
            </Link>
            <Button variant="outline" onClick={() => downloadGuestCsv(eventId, event.slug)}>
              <Download className="size-4" />
              Download CSV
            </Button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          {event.status === "published" ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {invitationUrl}
              </code>
              <Button variant="ghost" size="sm" onClick={() => copy(invitationUrl, "link")}>
                <Copy className="size-3.5" />
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              This is a draft — the link doesn&apos;t work for guests until you publish it.
            </p>
          )}
        </div>
      </header>

      {event.status === "published" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4 text-slate-400" />
              Invite people
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ShareButtons
              url={invitationUrl}
              subject={event.title}
              message={buildInviteMessage({
                title: event.title,
                // The zone belongs in a shared message too — it used to ride
                // along inside formatEventTime, which no longer carries it.
                whenLabel: `${formatEventDate(event.startsAt, event.timezone)} at ${formatEventTime(event.startsAt, event.timezone)} ${formatTimeZoneLabel(event.startsAt, event.timezone)}`,
                url: invitationUrl,
              })}
            />
            <p className="mt-3 text-sm text-slate-500">
              These open your own WhatsApp, mail app or messages — the invitation comes from you,
              not from us. Nothing is sent automatically, and there&apos;s no sending limit.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
        <CardContent className="space-y-3">
          {event.coverImageKey ? (
            <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              {coverUrl ? (
                /* Presigned R2 URL on a per-request host — next/image would need
                   every one of them in remotePatterns, and optimising a preview
                   the host looks at once buys nothing. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt="Event cover"
                  className="h-40 w-full object-cover sm:h-48"
                />
              ) : (
                <div className="flex h-40 items-center justify-center sm:h-48">
                  <Loader2 className="size-5 animate-spin text-slate-400" />
                </div>
              )}
            </div>
          ) : null}
          <p className="text-sm text-slate-500">
            {event.coverImageKey
              ? "Replacing it deletes the old one."
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

      {newResponses > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <BellDot className="size-4 shrink-0" />
          <span>
            <strong>
              {newResponses} new {newResponses === 1 ? "response" : "responses"}
            </strong>{" "}
            since you last looked — marked below.
          </span>
        </div>
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
                        <div className="flex items-center gap-1.5">
                          {isNewResponse(g) ? (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                              aria-label="New since you last looked"
                              title="New since you last looked"
                            />
                          ) : null}
                          <span className="font-medium">{g.name}</span>
                        </div>
                        {g.email ? <div className="text-xs text-slate-500">{g.email}</div> : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {g.rsvpStatus === "attending" ? (
                          <>
                            <div>{1 + g.plusOnes}</div>
                            {/* Names the guest supplied for the people they're
                                bringing — what a host actually needs for place
                                cards and a door list. */}
                            {g.plusOneNames?.length ? (
                              <div className="text-xs text-slate-500">
                                + {g.plusOneNames.join(", ")}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-[16rem] py-3 pr-4 text-slate-600">
                        {[g.dietaryNotes, g.message].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {g.firstViewedAt ? (
                            <Eye
                              className="size-3.5 shrink-0 text-slate-400"
                              aria-label="Has opened the invitation"
                            />
                          ) : null}
                          {/* Each guest's own link, so their reply arrives
                              already attributed to them rather than as a
                              stranger filling in the open form. */}
                          <GuestShareButtons
                            url={`${invitationUrl}?t=${g.inviteToken}`}
                            subject={event.title}
                            email={g.email}
                            phone={g.phone}
                            message={buildInviteMessage({
                              title: event.title,
                              // The zone belongs in a shared message too — it used to ride
                // along inside formatEventTime, which no longer carries it.
                whenLabel: `${formatEventDate(event.startsAt, event.timezone)} at ${formatEventTime(event.startsAt, event.timezone)} ${formatTimeZoneLabel(event.startsAt, event.timezone)}`,
                              url: `${invitationUrl}?t=${g.inviteToken}`,
                              guestName: g.name.split(" ")[0],
                            })}
                          />
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

      {/* Last on the page and visually set apart, so it is never the thing a
          host reaches for by accident while scanning RSVPs. */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-900">Delete this event</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 max-w-prose text-sm text-slate-600">
            Removes the invitation, its guest list and every RSVP. Anyone holding the link — or a
            printed QR code — will find nothing there.
          </p>
          <DeleteEventButton
            eventId={eventId}
            title={event.title}
            size="default"
            onDeleted={() => router.replace("/dashboard")}
          />
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
