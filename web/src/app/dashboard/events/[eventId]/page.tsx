"use client";

import {
  BellDot,
  CalendarDays,
  Check,
  Clapperboard,
  Copy,
  Download,
  Eye,
  Gift,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Mail,
  MapPin,
  Palette,
  PartyPopper,
  Pencil,
  Plus,
  Send,
  Settings,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addGuests,
  downloadGuestCsv,
  getAnalytics,
  getEvent,
  listGuests,
  markResponsesSeen,
  presignDownload,
  previewLink,
  publishEvent,
  sendInvitations,
  uploadCoverImage,
  type Analytics,
  type EventSummary,
  type FailedGuest,
  type GuestRow,
} from "@/lib/api/host";
import { ApiError } from "@/lib/api/browser";
import { Badge, rsvpVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  cn,
  formatEventDate,
  formatEventTime,
  formatRelative,
  formatTimestamp,
  formatTimeZoneLabel,
} from "@/lib/utils";
import { DeleteEventButton } from "../delete-event-button";
import { effectiveEnd, eventPhase } from "../event-status";
import { useMe } from "../../me-context";
import { BackLink, EmptyState, PageSpinner, Panel, Segmented, StatTile, StatusPill } from "../../ui";
import { PhotoAlbumCard } from "./photo-album";
import { EventQrCode } from "./qr-code";
import { ShareButtons, GuestShareButtons, buildInviteMessage } from "./share";
import { VideoInviteCard } from "./video-invite";
import { CashGiftsCard } from "./cash-gifts";
import { AlbumManager } from "./album-manager";
import { CohostsPanel } from "./cohosts-panel";
import { DatePollEditor } from "./date-poll-editor";
import { ExtrasSettings } from "./extras-settings";
import { GuestImport } from "./guest-import";
import { PotluckEditor } from "./potluck-editor";
import { answersSummary, QuestionsEditor } from "./questions-editor";
import { WaitlistPanel } from "./waitlist-panel";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// The event hub follows the host's journey: design the invitation, publish,
// invite guests, watch the replies (and gifts), then the after-party album.
// Each stage is a tab; every tab's panels stay MOUNTED and are only hidden,
// so a half-typed guest list or video form survives switching tabs and every
// feature card keeps fetching/polling exactly as it did on the old long page.
// "plan" (migration 0015): questions, potluck and the date poll.
type Tab = "overview" | "design" | "guests" | "rsvps" | "plan" | "gifts" | "after" | "settings";
const TABS: Tab[] = ["overview", "design", "guests", "rsvps", "plan", "gifts", "after", "settings"];

/**
 * Which tab to open. Stripe sends the host back with ?gifts=… (Connect
 * onboarding) or ?video=… (video checkout), so those land on the tab that
 * holds the card that reads them.
 */
function initialTab(params: URLSearchParams | null): Tab {
  const t = params?.get("tab");
  if (t && (TABS as string[]).includes(t)) return t as Tab;
  if (params?.get("gifts")) return "gifts";
  if (params?.get("video")) return "design";
  return "overview";
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const [tab, setTabState] = useState<Tab>(() => initialTab(searchParams));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rsvpFilter, setRsvpFilter] = useState<"all" | GuestRow["rsvpStatus"]>("all");
  // Read once per visit: "has the day ended" is a label, not a live clock.
  const [now] = useState(() => Date.now());

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
  const [failedGuests, setFailedGuests] = useState<FailedGuest[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Guests who can be emailed and haven't been. `invitedAt` is written from the
  // send result, so this is "mail has not reached them" rather than "a flag was
  // set when the row was created" — which is what it used to mean, and why the
  // list could claim people were invited when nothing had been sent.
  const uninvited = guests.filter((g) => g.email && !g.invitedAt);
  const [previewing, setPreviewing] = useState(false);
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
      setLoadError("Couldn't load this event.");
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
    setAddResult(null);
    setFailedGuests([]);
    try {
      await publishEvent(eventId);
      // Publishing sends nothing — it makes the link work. Saying what happens
      // next is the point: the guest box only appears now, and a host who
      // stops here has an event nobody has heard about.
      setAddResult("Published. Your invitation link is live — add your guests below and they'll be emailed.");
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

  async function onPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const { url } = await previewLink(eventId);
      // Opened after the await, so the popup blocker sees a window.open that
      // isn't in the click handler's own tick. Falling back to same-tab
      // navigation matters more than the new tab does — a blocked preview
      // looks exactly like a broken button.
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = url;
    } catch {
      setError("Couldn't open a preview just now.");
    } finally {
      setPreviewing(false);
    }
  }

  // The explicit send. `includeResponded: true` because the guests are named:
  // the filter that matters is "we have not written to them", which is already
  // applied here, and someone who replied through a forwarded link still never
  // got their own invitation.
  async function onSendInvitations() {
    const ids = uninvited.map((g) => g.id);
    if (ids.length === 0) return;
    setInviting(true);
    setError(null);
    setFailedGuests([]);
    try {
      const res = await sendInvitations(eventId, true, ids);
      if (!res.emailConfigured) {
        setAddResult("Email isn't set up yet, so nothing was sent — share the link or QR code instead.");
      } else {
        const failed = res.failed > 0 ? ` ${res.failed} didn't go out.` : "";
        const test = res.testNotSent ? ` Test mode: ${res.testNotSent} not sent.` : "";
        setAddResult(`Emailed ${res.delivered} guest${res.delivered === 1 ? "" : "s"}.${failed}${test}`);
        setFailedGuests(res.failedGuests ?? []);
      }
      await load();
    } catch {
      setError("Couldn't send those invitations.");
    } finally {
      setInviting(false);
    }
  }

  // `includeResponded: true` on purpose. These guests were chosen by name
  // because mail to them failed, and someone who replied in the meantime —
  // through a link a friend forwarded, say — would otherwise be silently
  // dropped from the retry without the host being told.
  async function onRetryFailed() {
    const ids = failedGuests.map((g) => g.id);
    if (ids.length === 0) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await sendInvitations(eventId, true, ids);
      const stillFailed = res.failedGuests ?? [];
      setFailedGuests(stillFailed);
      setAddResult(
        stillFailed.length === 0
          ? `Sent the remaining ${res.delivered}.`
          : `Sent ${res.delivered}. ${stillFailed.length} still didn't go out.`,
      );
      await load();
    } catch {
      setError("Couldn't send those invitations.");
    } finally {
      setRetrying(false);
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
      //
      // No "publish first" branch any more: guests cannot be added to a draft,
      // so reaching this code at all means the event is live and the add was a
      // send. The backlog panel below picks up whatever did not make it.
      const parts = [`Added ${res.added}.`];
      if (res.skipped > 0) parts.push(`Skipped ${res.skipped} already on the list.`);
      if (!res.emailConfigured) {
        parts.push("Email isn't set up yet, so no invitations were sent — share the link or QR code.");
      } else if (res.emailed > 0) {
        parts.push(`Emailed ${res.emailed}.`);
      }
      if (res.emailsFailed > 0) parts.push(`${res.emailsFailed} email(s) failed.`);
      // Admin testing as host / test host: guest email is held back (lib/testMode).
      if (res.testNotSent) parts.push(`Test mode: ${res.testNotSent} invitation(s) not sent.`);
      setAddResult(parts.join(" "));
      setFailedGuests(res.failedGuests ?? []);
      await load();
    } catch {
      setError("Couldn't add those guests.");
    } finally {
      setAddingGuests(false);
    }
  }


  // Keeps the other query params (Stripe's ?video=paid is read by the video
  // card while it polls) and doesn't add a history entry per tab click.
  function setTab(next: Tab) {
    setTabState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  if (loadError) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={loadError}
        action={
          <Link href="/dashboard">
            <Button variant="outline" className="rounded-full">
              Back to your events
            </Button>
          </Link>
        }
      />
    );
  }
  if (!event || !analytics) return <PageSpinner />;

  const invitationUrl = `${SITE_URL}/e/${event.slug}`;
  const published = event.status === "published";
  const phase = eventPhase(event, now);
  const ended = effectiveEnd(event) < now;
  const whenLabel = `${formatEventDate(event.startsAt, event.timezone)} at ${formatEventTime(event.startsAt, event.timezone)} ${formatTimeZoneLabel(event.startsAt, event.timezone)}`;
  // Display hints only: the API decides VIDEO_INVITES / CASH_GIFTS
  // (/auth/me features), and each card also renders nothing on the API's 404.
  // A co-host (migration 0015) manages the event but not its paid features
  // or its deletion; the API enforces it, this just doesn't offer them.
  const isOwner = event.myRole !== "cohost";
  const giftsOn = me?.features?.cashGifts === true && isOwner;
  const videoOn = me?.features?.videoInvites === true && isOwner;
  const questions = event.rsvpQuestions ?? [];
  const hasCard = Boolean((event as EventSummary & { cardImageKey?: string | null }).cardImageKey);

  // Compared against the baseline captured on first load, not the live server
  // value — that gets cleared moments after the page renders, and the
  // highlights should stay put while the host is reading.
  const isNewResponse = (g: GuestRow) =>
    Boolean(g.respondedAt) &&
    (!seenBaseline || new Date(g.respondedAt!) > new Date(seenBaseline));
  const newResponses = guests.filter(isNewResponse).length;
  const responded = guests.filter((g) => g.respondedAt);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  // --- journey ---------------------------------------------------------------
  type StepState = "done" | "todo" | "warn" | "optional";
  const steps: { key: string; label: string; detail: string; state: StepState; tab: Tab }[] = [
    {
      key: "design",
      label: "Design",
      detail: event.cardStale ? "Card out of date" : hasCard ? "Card saved" : "Card optional",
      state: event.cardStale ? "warn" : hasCard ? "done" : "optional",
      tab: "design",
    },
    {
      key: "publish",
      label: "Publish",
      detail: published ? "Link is live" : "Still a draft",
      state: published ? "done" : "todo",
      tab: "overview",
    },
    {
      key: "guests",
      label: "Guests",
      detail:
        uninvited.length > 0
          ? `${uninvited.length} not sent`
          : guests.length > 0
            ? `${guests.length} on the list`
            : "None yet",
      state: uninvited.length > 0 ? "warn" : guests.length > 0 ? "done" : "todo",
      tab: "guests",
    },
    {
      key: "rsvps",
      label: "Replies",
      detail: `${responded.length} of ${guests.length} replied`,
      state: guests.length > 0 && analytics.rsvp.pending === 0 ? "done" : responded.length > 0 ? "optional" : "todo",
      tab: "rsvps",
    },
    {
      key: "after",
      label: "After",
      detail: event.photoAlbumUrl ? "Album shared" : ended ? "Share photos" : "After the day",
      state: event.photoAlbumUrl ? "done" : "optional",
      tab: "after",
    },
  ];

  const publishButtons = (
    <div className="flex flex-wrap gap-2">
      {/* The preview link is minted per click, scoped to this event and dead
          in two hours. */}
      <Button variant="outline" className="rounded-full" disabled={previewing} onClick={onPreview}>
        {previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
        Preview
      </Button>
      <Button className="rounded-full" onClick={onPublish} disabled={publishing}>
        {publishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Publish
      </Button>
    </div>
  );

  // The one thing to do next, said plainly on the Overview.
  const next: { title: string; body: string; action: React.ReactNode } | null = !published
    ? {
        title: "Publish when it looks right",
        body: "Your invitation is a draft: the link doesn't work for guests yet. Preview it, then publish. Publishing sends nothing — you add guests after.",
        action: publishButtons,
      }
    : uninvited.length > 0
      ? {
          title: `${uninvited.length} invitation${uninvited.length === 1 ? "" : "s"} still to send`,
          body: "Their invitation didn't go out yet. Send them from the Guests tab.",
          action: (
            <Button className="rounded-full" onClick={() => setTab("guests")}>
              <Mail className="size-4" />
              Go to guests
            </Button>
          ),
        }
      : guests.length === 0 && !ended
        ? {
            title: "Invite your guests",
            body: "Paste your guest list and they're emailed straight away — or share the link, a WhatsApp message or the QR code yourself.",
            action: (
              <Button className="rounded-full" onClick={() => setTab("guests")}>
                <UserPlus className="size-4" />
                Add guests
              </Button>
            ),
          }
        : ended && !event.photoAlbumUrl
          ? {
              title: "Share the photos",
              body: "The day is over. Point guests at your shared album and thank them in one go.",
              action: (
                <Button className="rounded-full" onClick={() => setTab("after")}>
                  <PartyPopper className="size-4" />
                  After the event
                </Button>
              ),
            }
          : null;

  const tabs: { value: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "design", label: "Design", icon: Palette },
    { value: "guests", label: "Guests", icon: Users, badge: guests.length || undefined },
    { value: "rsvps", label: "RSVPs", icon: Check, badge: (newResponses || 0) + guests.filter((g) => g.rsvpStatus === "waitlisted").length || undefined },
    { value: "plan", label: "Plan", icon: ListChecks },
    ...(giftsOn ? [{ value: "gifts" as Tab, label: "Gifts", icon: Gift }] : []),
    { value: "after", label: "After", icon: PartyPopper },
    { value: "settings", label: "Settings", icon: Settings },
  ];
  // A ?tab=gifts link for an account without gifts falls back to Overview
  // (once /auth/me has answered).
  const activeTab: Tab = tab === "gifts" && !giftsOn && me !== undefined ? "overview" : tab;
  const show = (t: Tab) => activeTab === t;

  const filteredResponses = guests.filter((g) => rsvpFilter === "all" || g.rsvpStatus === rsvpFilter);
  const statusPill = <StatusPill status={phase === "past" ? "past" : event.status} />;

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard">All events</BackLink>

      {/* The header doubles as the at-a-glance summary: what it is, when and
          where, the link guests use, and where the event is in the journey. */}
      <header className="rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm shadow-zinc-900/5 backdrop-blur-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {statusPill}
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{event.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-zinc-600">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-zinc-400" />
                {formatEventDate(event.startsAt, event.timezone)}
                {" · "}
                {formatEventTime(event.startsAt, event.timezone)}
                <span className="text-zinc-400">{formatTimeZoneLabel(event.startsAt, event.timezone)}</span>
              </span>
              {event.locationName ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-zinc-400" />
                  {event.locationName}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Users className="size-4 text-zinc-400" />
                {/* From analytics: the single-event row doesn't carry the
                    list projection's headcount. */}
                {analytics.rsvp.headcount} attending
                {event.capacity ? ` of ${event.capacity}` : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!published ? (
              publishButtons
            ) : (
              <a href={invitationUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="rounded-full">
                  <Eye className="size-4" />
                  View invitation
                </Button>
              </a>
            )}
            <Link href={`/dashboard/events/${eventId}/edit`}>
              <Button variant="outline" className="rounded-full">
                <Pencil className="size-4" />
                Edit details
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4">
          {published ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 truncate rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700">
                {invitationUrl}
              </code>
              <Button variant="ghost" size="sm" onClick={() => copy(invitationUrl, "link")}>
                <Copy className="size-3.5" />
                {copied === "link" ? "Copied" : "Copy link"}
              </Button>
            </div>
          ) : (
            /* Loud on purpose. A host who thinks their invitation is out, when
               it is actually a draft whose link 404s, finds out from a guest —
               usually too late. */
            <p className="flex items-center gap-2 text-sm font-bold text-red-600">
              <TriangleAlert className="size-4 shrink-0" />
              This is a draft — the link doesn&apos;t work for guests until you publish it.
            </p>
          )}
        </div>

        {/* Journey: one step per stage; each opens its tab. */}
        <ol className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {steps.map((s, i) => (
            <li key={s.key} className="min-w-[8.5rem] flex-1">
              <button
                type="button"
                onClick={() => setTab(s.tab)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-zinc-300"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    s.state === "done" && "bg-emerald-500 text-white",
                    s.state === "warn" && "bg-amber-400 text-amber-950",
                    s.state === "todo" && "bg-zinc-900 text-white",
                    s.state === "optional" && "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {s.state === "done" ? <Check className="size-3.5" /> : s.state === "warn" ? "!" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-900">{s.label}</span>
                  <span className="block truncate text-xs text-zinc-500">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      {/* Tabs: sticky under the site header so they stay reachable on a long guest list. */}
      <nav
        aria-label="Event sections"
        className="sticky top-[110px] z-20 rounded-full border border-zinc-200 bg-white/90 p-1 shadow-sm shadow-zinc-900/5 backdrop-blur md:top-[72px]"
      >
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={activeTab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                activeTab === t.value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
              {t.badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    activeTab === t.value ? "bg-white/20" : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {/* Action feedback stays visible whichever tab the action came from. */}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {addResult ? (
        <p className="rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm text-zinc-700">{addResult}</p>
      ) : null}

      {/* ---------------- Overview ---------------- */}
      <div hidden={!show("overview")} className="space-y-6">
        {next ? (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[.2em] text-amber-800 uppercase">Next step</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900">{next.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">{next.body}</p>
            <div className="mt-4">{next.action}</div>
          </section>
        ) : null}

        {newResponses > 0 ? (
          <button
            type="button"
            onClick={() => setTab("rsvps")}
            className="flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-900"
          >
            <BellDot className="size-4 shrink-0" />
            <span>
              <strong>
                {newResponses} new {newResponses === 1 ? "response" : "responses"}
              </strong>{" "}
              since you last looked — see RSVPs.
            </span>
          </button>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Going" value={analytics.rsvp.headcount} hint={`${analytics.rsvp.attending} replied yes`} tone="good" />
          <StatTile label="Awaiting reply" value={analytics.rsvp.pending} />
          <StatTile
            label="Response rate"
            value={`${Math.round(analytics.responseRate * 100)}%`}
            hint={`${analytics.rsvp.invited} invited`}
          />
          <StatTile label="Views" value={analytics.views.total} hint={`${analytics.views.uniqueVisitors} unique`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Latest replies"
            icon={Check}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setTab("rsvps")}>
                All RSVPs
              </Button>
            }
          >
            {responded.length === 0 ? (
              <p className="text-sm text-zinc-500">No replies yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {[...responded]
                  .sort((a, b) => new Date(b.respondedAt!).getTime() - new Date(a.respondedAt!).getTime())
                  .slice(0, 5)
                  .map((g) => (
                    <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                      {isNewResponse(g) ? <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" /> : null}
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{g.name}</span>
                      <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      <span className="w-20 text-right text-xs text-zinc-500">{formatRelative(g.respondedAt!)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>

          <Panel title="Make it special" icon={PartyPopper} description="Optional extras for this invitation.">
            <ul className="space-y-1 text-sm">
              <ExtraRow
                icon={Palette}
                title="Invitation card"
                body={
                  event.cardStale
                    ? "Out of date — the event changed since it was made."
                    : hasCard
                      ? "Saved. Used on WhatsApp and in link previews."
                      : "Design the picture you send on WhatsApp."
                }
                warn={event.cardStale}
                onClick={() => setTab("design")}
              />
              {videoOn ? (
                <ExtraRow
                  icon={Clapperboard}
                  title="Video invite"
                  body="A short panda video with your words."
                  onClick={() => setTab("design")}
                />
              ) : null}
              {giftsOn ? (
                <ExtraRow
                  icon={Gift}
                  title="Cash gifts"
                  body="Let guests send a gift with their RSVP."
                  onClick={() => setTab("gifts")}
                />
              ) : null}
              <ExtraRow
                icon={ImagePlus}
                title="Photo album"
                body="Share the photos with everyone after the day."
                onClick={() => setTab("after")}
              />
            </ul>
          </Panel>
        </div>
      </div>

      {/* ---------------- Design ---------------- */}
      <div hidden={!show("design")} className="space-y-6">
        {/* The card image is flattened once and never re-rendered, so an edit to
            the title, date or place leaves it showing the old ones — in every
            chat it was forwarded to, and in the link preview, silently. Amber
            rather than red: nothing is broken, but it is wrong. */}
        {event.cardStale && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <TriangleAlert className="size-4 shrink-0 text-amber-700" />
            <p className="flex-1 text-sm text-amber-900">
              Your saved invitation card is out of date — this event has changed since it was made.
              Link previews and anything already shared still show the old details.
            </p>
            <Link href={`/dashboard/events/${eventId}/design`}>
              <Button size="sm" variant="outline">
                <Palette className="size-4" />
                Update the card
              </Button>
            </Link>
          </div>
        )}

        <Panel
          title="Invitation card"
          icon={Palette}
          description="The picture you send on WhatsApp, and the preview people see when the link is shared. The invitation page itself keeps its own layout."
          actions={
            <Link href={`/dashboard/events/${eventId}/design`}>
              <Button size="sm" className="rounded-full">
                <Palette className="size-4" />
                {hasCard ? "Edit the card" : "Design the card"}
              </Button>
            </Link>
          }
        >
          <p className="text-sm text-zinc-500">
            {hasCard
              ? event.cardStale
                ? "Saved, but out of date."
                : "Saved and up to date."
              : "No card saved yet — optional."}
          </p>
        </Panel>

        <Panel
          title="Cover image"
          icon={ImagePlus}
          actions={
            <>
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
                className="rounded-full"
                disabled={uploading}
                onClick={() => coverRef.current?.click()}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
                {event.coverImageKey ? "Replace" : "Upload"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {event.coverImageKey ? (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                {coverUrl ? (
                  /* Presigned R2 URL on a per-request host — next/image would need
                     every one of them in remotePatterns, and optimising a preview
                     the host looks at once buys nothing. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="Event cover" className="h-40 w-full object-cover sm:h-48" />
                ) : (
                  <div className="flex h-40 items-center justify-center sm:h-48">
                    <Loader2 className="size-5 animate-spin text-zinc-400" />
                  </div>
                )}
              </div>
            ) : null}
            <p className="text-sm text-zinc-500">
              {event.coverImageKey
                ? "Replacing it deletes the old one."
                : "Optional — until you add one, the design's own artwork fills the top of the invitation. JPEG, PNG, WebP or AVIF, up to 10MB."}
            </p>
          </div>
        </Panel>

        {/* Renders nothing while the API has video invites off for this account. */}
        <VideoInviteCard
          eventId={eventId}
          title={event.title}
          defaults={{
            headline: event.title,
            when: `${formatEventDate(event.startsAt, event.timezone)} · ${formatEventTime(event.startsAt, event.timezone)}`,
            where: event.locationName ?? "",
          }}
        />
      </div>

      {/* ---------------- Guests ---------------- */}
      <div hidden={!show("guests")} className="space-y-6">
        <Panel title="Invite guests" icon={UserPlus}>
          {/* Guests cannot be added to a draft. Adding guests only ever mailed
              them if the event was already published, so the natural order —
              create, paste the list, publish — once produced a live event with
              a full guest list and not one invitation sent. Removing the entry
              box while the event is a draft makes that impossible; the panel
              stays, saying what unlocks it. */}
          {!published ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Publish the event first. Guests you add after that are emailed their invitation
                straight away, so the link has to be working before anyone receives it.
              </p>
              {publishButtons}
            </div>
          ) : (
            <div className="space-y-3">
              {/* One textarea rather than a repeating row form: hosts arrive
                  with a list already written down somewhere. */}
              <Textarea
                rows={4}
                value={bulkGuests}
                onChange={(e) => setBulkGuests(e.target.value)}
                placeholder={"One per line:\nMeera Iyer, meera@example.com\nSanjay Rao"}
              />
              <p className="text-xs text-zinc-500">
                Guests with an email address are sent their invitation as soon as you add them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={addingGuests || !bulkGuests.trim()}
                  onClick={onAddGuests}
                >
                  {addingGuests ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add guests
                </Button>
                {/* Deliberately no "email the ones who haven't replied" button:
                    a guest gets exactly one invitation, and the API enforces it. */}
              </div>

              {/* A non-zero count here means a send did not land (the day's
                  mail allowance, the gateway, a rejected address): a standing
                  statement of who is still waiting, and a way to try again. */}
              {uninvited.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">
                    {uninvited.length} guest{uninvited.length === 1 ? "" : "s"} still waiting for an
                    invitation
                  </p>
                  <p className="mt-1 text-xs text-amber-900/70">
                    Their invitation didn&apos;t go out. There&apos;s a daily limit on how much mail
                    can be sent — if you&apos;ve just added a lot of guests, try again tomorrow.
                  </p>
                  <Button size="sm" className="mt-3" disabled={inviting} onClick={onSendInvitations}>
                    {inviting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                    Send {uninvited.length === 1 ? "the invitation" : `${uninvited.length} invitations`}
                  </Button>
                </div>
              ) : null}

              {/* Named, not counted: a host shown who they were can re-send to
                  exactly those. */}
              {failedGuests.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">
                    {failedGuests.length} invitation{failedGuests.length === 1 ? "" : "s"} didn&apos;t
                    go out
                  </p>
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-sm text-amber-900/80">
                    {failedGuests.map((g) => (
                      <li key={g.id}>
                        {g.name} <span className="text-amber-900/60">· {g.email}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-900/70">
                    There&apos;s a daily limit on how much mail can go out. If you&apos;ve just sent a
                    lot, try these again tomorrow.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" disabled={retrying} onClick={onRetryFailed}>
                    {retrying ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                    Try these again
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </Panel>

        {published ? (
          <GuestImport
            eventId={eventId}
            existing={guests}
            onImported={(msg) => {
              setAddResult(msg);
              void load();
            }}
          />
        ) : null}

        {published ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Share it yourself"
              icon={Send}
              description="These open your own WhatsApp, mail app or messages — the invitation comes from you, not from us. Nothing is sent automatically, and there's no sending limit."
            >
              <ShareButtons
                url={invitationUrl}
                subject={event.title}
                message={buildInviteMessage({ title: event.title, whenLabel, url: invitationUrl })}
              />
            </Panel>
            {/* Only for a published event — a QR pointing at a draft would scan to a 404. */}
            <div className="space-y-2">
              <EventQrCode url={invitationUrl} slug={event.slug} />
              {event.allowPublicRsvp === false ? (
                <p className="px-1 text-sm text-amber-700">
                  This event is invitation-only, so scanning the code shows the invitation but
                  can&apos;t be used to reply. Turn on &ldquo;anyone with the link can RSVP&rdquo;, or share
                  each guest&apos;s personal link instead.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <Panel
          title="Guest list"
          icon={Users}
          description="Each guest has a personal link, so their reply arrives already attributed to them."
          actions={<span className="text-sm text-zinc-500">{guests.length} guests</span>}
        >
          {guests.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              No guests yet. Share the invitation link, or add guests to send personal invites.
            </p>
          ) : (
            <>
            {/* Phones: one card per guest instead of a sideways-scrolling table. */}
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {guests.map((g) => (
                <li key={g.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900">{g.name}</div>
                      {g.email ? <div className="truncate text-xs text-zinc-500">{g.email}</div> : null}
                    </div>
                    <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className={g.invitedAt ? "text-emerald-700" : g.email && g.source !== "public" ? "font-medium text-amber-700" : "text-zinc-500"}>
                      {g.source === "public"
                        ? "Replied via the link"
                        : g.invitedAt
                          ? `Emailed ${formatRelative(g.invitedAt)}`
                          : g.email
                            ? "Not sent yet"
                            : "No email — share their link"}
                      {g.firstViewedAt ? " · opened" : ""}
                    </span>
                    <GuestShareButtons
                      url={`${invitationUrl}?t=${g.inviteToken}`}
                      subject={event.title}
                      email={g.email}
                      phone={g.phone}
                      message={buildInviteMessage({
                        title: event.title,
                        whenLabel,
                        url: `${invitationUrl}?t=${g.inviteToken}`,
                        guestName: g.name.split(" ")[0],
                      })}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="-mx-5 hidden overflow-x-auto px-5 sm:-mx-6 sm:block sm:px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs tracking-wide text-zinc-500 uppercase">
                    <th className="pr-4 pb-2 font-medium">Guest</th>
                    <th className="pr-4 pb-2 font-medium">Invitation</th>
                    <th className="pr-4 pb-2 font-medium">Reply</th>
                    <th className="pb-2 font-medium">Personal link</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => (
                    <tr key={g.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-zinc-900">{g.name}</div>
                        {g.email ? <div className="text-xs text-zinc-500">{g.email}</div> : null}
                      </td>
                      <td className="py-3 pr-4 text-xs whitespace-nowrap">
                        {g.source === "public" ? (
                          <span className="text-zinc-500">Replied via the link</span>
                        ) : g.invitedAt ? (
                          <span className="text-emerald-700">Emailed {formatRelative(g.invitedAt)}</span>
                        ) : g.email ? (
                          <span className="font-medium text-amber-700">Not sent yet</span>
                        ) : (
                          <span className="text-zinc-500">No email — share their link</span>
                        )}
                        {g.firstViewedAt ? (
                          <span className="mt-0.5 flex items-center gap-1 text-zinc-500">
                            <Eye className="size-3" aria-hidden /> Opened
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      </td>
                      <td className="py-3">
                        {/* Each guest's own link, so their reply arrives already
                            attributed to them rather than as a stranger filling
                            in the open form. */}
                        <GuestShareButtons
                          url={`${invitationUrl}?t=${g.inviteToken}`}
                          subject={event.title}
                          email={g.email}
                          phone={g.phone}
                          message={buildInviteMessage({
                            title: event.title,
                            whenLabel,
                            url: `${invitationUrl}?t=${g.inviteToken}`,
                            guestName: g.name.split(" ")[0],
                          })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>
      </div>

      {/* ---------------- RSVPs ---------------- */}
      <div hidden={!show("rsvps")} className="space-y-6">
        <WaitlistPanel
          eventId={eventId}
          guests={guests}
          capacity={event.capacity}
          headcount={analytics.rsvp.headcount}
          onChanged={() => void load()}
        />
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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Going" value={analytics.rsvp.headcount} hint={`${analytics.rsvp.attending} replied yes`} tone="good" />
          <StatTile label="Maybe" value={analytics.rsvp.maybe} />
          <StatTile label="Can't come" value={analytics.rsvp.declined} />
          <StatTile
            label="Awaiting reply"
            value={analytics.rsvp.pending}
            hint={`${Math.round(analytics.responseRate * 100)}% replied`}
          />
        </div>

        <Panel
          title="Replies"
          icon={Check}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => downloadGuestCsv(eventId, event.slug)}
            >
              <Download className="size-4" />
              Download CSV
            </Button>
          }
        >
          <div className="mb-4">
            <Segmented
              label="Filter replies"
              value={rsvpFilter}
              onChange={setRsvpFilter}
              options={[
                { value: "all", label: "All", count: guests.length },
                { value: "attending", label: "Going", count: guests.filter((g) => g.rsvpStatus === "attending").length },
                { value: "maybe", label: "Maybe", count: guests.filter((g) => g.rsvpStatus === "maybe").length },
                { value: "declined", label: "Can't come", count: guests.filter((g) => g.rsvpStatus === "declined").length },
                { value: "pending", label: "Awaiting", count: guests.filter((g) => g.rsvpStatus === "pending").length },
                ...(guests.some((g) => g.rsvpStatus === "waitlisted")
                  ? [{ value: "waitlisted" as const, label: "Waitlist", count: guests.filter((g) => g.rsvpStatus === "waitlisted").length }]
                  : []),
              ]}
            />
          </div>
          {filteredResponses.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Nobody here yet.</p>
          ) : (
            <>
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {filteredResponses.map((g) => (
                <li key={g.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {isNewResponse(g) ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="New since you last looked" />
                      ) : null}
                      <span className="truncate font-medium text-zinc-900">{g.name}</span>
                    </div>
                    <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {g.respondedAt ? `Replied ${formatRelative(g.respondedAt)}` : "No reply yet"}
                    {g.rsvpStatus === "attending" ? ` · party of ${1 + g.plusOnes}` : ""}
                    {g.plusOneNames?.length ? ` (+ ${g.plusOneNames.join(", ")})` : ""}
                  </p>
                  {g.dietaryNotes || g.message || answersSummary(questions, g.answers) ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      {[answersSummary(questions, g.answers), g.dietaryNotes, g.message].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="-mx-5 hidden overflow-x-auto px-5 sm:-mx-6 sm:block sm:px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs tracking-wide text-zinc-500 uppercase">
                    <th className="pr-4 pb-2 font-medium">Name</th>
                    <th className="pr-4 pb-2 font-medium">RSVP</th>
                    <th className="pr-4 pb-2 font-medium">Replied</th>
                    <th className="pr-4 pb-2 font-medium">Party</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResponses.map((g) => (
                    <tr key={g.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          {isNewResponse(g) ? (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                              aria-label="New since you last looked"
                              title="New since you last looked"
                            />
                          ) : null}
                          <span className="font-medium text-zinc-900">{g.name}</span>
                        </div>
                        {g.email ? <div className="text-xs text-zinc-500">{g.email}</div> : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      </td>
                      {/* When they answered, not merely that they did. It moves
                          when a guest changes their answer, so it always reads
                          as the current reply's time. */}
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {g.respondedAt ? (
                          <>
                            <div title={new Date(g.respondedAt).toLocaleString()}>
                              {formatTimestamp(g.respondedAt, event.timezone)}
                            </div>
                            <div className="text-xs text-zinc-500">{formatRelative(g.respondedAt)}</div>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {g.rsvpStatus === "attending" ? (
                          <>
                            <div>{1 + g.plusOnes}</div>
                            {/* Names for the people they're bringing — what a
                                host needs for place cards and a door list. */}
                            {g.plusOneNames?.length ? (
                              <div className="text-xs text-zinc-500">+ {g.plusOneNames.join(", ")}</div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-[16rem] py-3 text-zinc-600">
                        {[answersSummary(questions, g.answers), g.dietaryNotes, g.message].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>
      </div>

      {/* ---------------- Plan (questions, potluck, date poll) ---------------- */}
      <div hidden={!show("plan")} className="space-y-6">
        <QuestionsEditor
          key={`q-${questions.length}`}
          eventId={eventId}
          initial={questions}
          onSaved={(q) => setEvent((e) => (e ? { ...e, rsvpQuestions: q } : e))}
        />
        <PotluckEditor
          eventId={eventId}
          enabled={event.potluckEnabled ?? false}
          onToggled={(on) => setEvent((e) => (e ? { ...e, potluckEnabled: on } : e))}
        />
        <DatePollEditor eventId={eventId} timezone={event.timezone} onPicked={() => void load()} />
      </div>

      {/* ---------------- Gifts ---------------- */}
      {/* Mounted only when the API says cash gifts are on for this account; the
          card itself also renders nothing on the API's 404. */}
      {giftsOn ? (
        <div hidden={!show("gifts")} className="space-y-3">
          <CashGiftsCard eventId={eventId} />
          <p className="px-1 text-xs text-zinc-500">
            Payout status and Stripe tax forms are also under{" "}
            <Link href="/dashboard/account" className="underline">
              Account
            </Link>
            .
          </p>
        </div>
      ) : null}

      {/* ---------------- After the event ---------------- */}
      <div hidden={!show("after")} className="space-y-6">
        {!ended ? (
          <p className="rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm text-zinc-600">
            This is for after the day: share one album link with everyone, and keep a copy of the guest list.
          </p>
        ) : null}
        <AlbumManager
          eventId={eventId}
          slug={event.slug}
          onChanged={(patch) => setEvent((e) => (e ? { ...e, ...patch } : e))}
        />
        <PhotoAlbumCard
          eventId={eventId}
          albumUrl={event.photoAlbumUrl ?? null}
          recipientCounts={{
            all: guests.filter((g) => g.email).length,
            attending: guests.filter((g) => g.email && g.rsvpStatus === "attending").length,
          }}
        />
        <Panel
          title="Keep the guest list"
          icon={Download}
          description="Everyone, their reply, party size and notes, as a spreadsheet."
          actions={
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => downloadGuestCsv(eventId, event.slug)}
            >
              <Download className="size-4" />
              Download CSV
            </Button>
          }
        />
      </div>

      {/* ---------------- Settings ---------------- */}
      <div hidden={!show("settings")} className="space-y-6">
        <Panel
          title="Event details"
          icon={Pencil}
          description="Title, date and time, place, design, RSVP options (plus-ones, capacity, deadline, dietary notes) and the guestbook."
          actions={
            <Link href={`/dashboard/events/${eventId}/edit`}>
              <Button size="sm" className="rounded-full">
                <Pencil className="size-4" />
                Edit details
              </Button>
            </Link>
          }
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Who can reply</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">
                {event.allowPublicRsvp === false ? "Invited guests only" : "Anyone with the link"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Capacity</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">{event.capacity ?? "No limit"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="mt-0.5">{statusPill}</dd>
            </div>
          </dl>
        </Panel>

        <ExtrasSettings key={event.id} event={event} onSaved={(e) => setEvent((prev) => (prev ? { ...prev, ...e } : e))} />

        <CohostsPanel eventId={eventId} isOwner={isOwner} />

        {/* Last and visually set apart, so it is never the thing a host
            reaches for by accident. Owner only: a co-host can't delete. */}
        {isOwner ? (
        <Panel title="Delete this event" tone="danger">
          <p className="mb-4 max-w-prose text-sm text-zinc-600">
            Removes the invitation, its guest list and every RSVP. Anyone holding the link — or a
            printed QR code — will find nothing there.
          </p>
          <DeleteEventButton
            eventId={eventId}
            title={event.title}
            size="default"
            onDeleted={() => router.replace("/dashboard")}
          />
        </Panel>
        ) : null}
      </div>
    </div>
  );
}

function ExtraRow({
  icon: Icon,
  title,
  body,
  warn,
  onClick,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-50"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            warn ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-[#b98d4f]",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-zinc-900">{title}</span>
          <span className="block text-zinc-500">{body}</span>
        </span>
      </button>
    </li>
  );
}
