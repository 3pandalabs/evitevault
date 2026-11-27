"use client";

import {
  ArrowRight,
  BellDot,
  CalendarDays,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageSquareHeart,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  listEvents,
  listGreetings,
  type EventSummary,
  type GreetingSummary,
} from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEventDate, formatRelative } from "@/lib/utils";
import { DeleteEventButton } from "./events/delete-event-button";
import { useMe } from "./me-context";
import { EmptyState, PageHeader, PageSpinner, Panel, Segmented, StatTile, StatusPill } from "./ui";
import { eventPhase, RsvpBar } from "./events/event-status";

// Cards per page. The grid is two wide on desktop, so an even number keeps
// the last row full.
const PER_PAGE = 6;

type Filter = "upcoming" | "drafts" | "past" | "all";

export default function DashboardPage() {
  const router = useRouter();
  const me = useMe();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [greetings, setGreetings] = useState<GreetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read once per visit: grouping by "past" is a label, not a live clock.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    // Events gate the page; greetings are best-effort (a 404 from an older API
    // just shows the section empty).
    listEvents()
      .then((e) => setEvents(e.events))
      .catch((err) => {
        // A 401 here means the refresh token is gone too (hostFetch already
        // retried), so there is nothing to do but send them back to sign in.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Couldn't load your dashboard.");
      });

    listGreetings()
      .then((g) => setGreetings(g.greetings))
      .catch(() => setGreetings([]));
  }, [router]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!events || !greetings) return <PageSpinner />;

  const upcoming = events.filter((e) => eventPhase(e, now) === "upcoming");
  const drafts = events.filter((e) => eventPhase(e, now) === "draft");
  const past = events.filter((e) => eventPhase(e, now) === "past");
  const firstName = me?.displayName?.split(" ")[0];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Dashboard"
        title={firstName ? `Hi, ${firstName}` : "Your events"}
        description="Everything you're hosting, and what needs you next."
        actions={
          <Link href="/dashboard/events/new">
            <Button className="rounded-full">
              <Plus className="size-4" />
              New event
            </Button>
          </Link>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarHeart}
          title="No events yet"
          body="Create your first invitation: pick a design, send it to your guests and watch the RSVPs come in."
          action={
            <Link href="/dashboard/events/new">
              <Button className="rounded-full">
                <Plus className="size-4" />
                Create an event
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <AtAGlance upcoming={upcoming} drafts={drafts} events={events} />
          <NeedsAttention events={events} now={now} />
          <EventsSection
            events={events}
            counts={{ upcoming: upcoming.length, drafts: drafts.length, past: past.length }}
            now={now}
            onDeleted={(id) => setEvents((cur) => (cur ?? []).filter((e) => e.id !== id))}
          />
        </>
      )}

      <GreetingsTeaser greetings={greetings} />
    </div>
  );
}

// --- at a glance -------------------------------------------------------------

function AtAGlance({
  upcoming,
  drafts,
  events,
}: {
  upcoming: EventSummary[];
  drafts: EventSummary[];
  events: EventSummary[];
}) {
  const going = upcoming.reduce((n, e) => n + e.headcount, 0);
  const awaiting = upcoming.reduce((n, e) => n + e.pending, 0);
  const fresh = events.reduce((n, e) => n + e.newResponses, 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Upcoming" value={upcoming.length} hint={drafts.length ? `+ ${drafts.length} draft${drafts.length === 1 ? "" : "s"}` : "live events"} />
      <StatTile label="Guests going" value={going} hint="across upcoming events" tone={going ? "good" : "default"} />
      <StatTile label="Awaiting reply" value={awaiting} hint="invited, no answer yet" />
      <StatTile label="New replies" value={fresh} hint="since you last looked" tone={fresh ? "warn" : "default"} />
    </div>
  );
}

// --- needs attention ---------------------------------------------------------

function NeedsAttention({ events, now }: { events: EventSummary[]; now: number }) {
  const items: { ev: EventSummary; icon: typeof BellDot; text: string; tone: "warn" | "info" }[] = [];
  for (const ev of events) {
    const phase = eventPhase(ev, now);
    if (phase === "draft" && new Date(ev.startsAt).getTime() > now) {
      items.push({ ev, icon: TriangleAlert, tone: "warn", text: "Still a draft: the link doesn't work for guests until you publish." });
    } else if (ev.newResponses > 0) {
      items.push({ ev, icon: BellDot, tone: "info", text: `${ev.newResponses} new ${ev.newResponses === 1 ? "reply" : "replies"} to read.` });
    } else if (phase === "upcoming" && ev.invited === 0) {
      items.push({ ev, icon: Users, tone: "warn", text: "Live, but nobody is on the guest list yet." });
    }
  }
  if (items.length === 0) return null;

  return (
    <Panel title="Needs your attention" icon={BellDot}>
      <ul className="divide-y divide-zinc-100">
        {items.slice(0, 5).map(({ ev, icon: Icon, text, tone }) => (
          <li key={ev.id}>
            <Link
              href={`/dashboard/events/${ev.id}`}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-zinc-50"
            >
              <Icon className={tone === "warn" ? "size-4 shrink-0 text-amber-600" : "size-4 shrink-0 text-emerald-600"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-900">{ev.title}</span>
                <span className="block text-sm text-zinc-500">{text}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- events -----------------------------------------------------------------

function EventsSection({
  events,
  counts,
  now,
  onDeleted,
}: {
  events: EventSummary[];
  counts: { upcoming: number; drafts: number; past: number };
  now: number;
  onDeleted: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>(counts.upcoming > 0 ? "upcoming" : "all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((ev) => {
        const phase = eventPhase(ev, now);
        if (filter === "upcoming" && phase !== "upcoming") return false;
        if (filter === "drafts" && phase !== "draft") return false;
        if (filter === "past" && phase !== "past") return false;
        return !q || ev.title.toLowerCase().includes(q) || (ev.locationName ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // Soonest first for what's coming; most recent first for what's over.
        const d = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        return filter === "past" ? -d : d;
      });
  }, [events, filter, query, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // A delete, a new filter or a new search can drop the current page out of
  // range; clamp rather than render an empty page the user can't leave.
  const current = Math.min(page, pageCount - 1);
  const slice = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Your events</h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search events"
            aria-label="Search events"
            className="rounded-full border-zinc-200 bg-white/80 pl-9"
          />
        </div>
      </div>
      <div className="mt-3">
        <Segmented<Filter>
          label="Filter events"
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setPage(0);
          }}
          options={[
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "drafts", label: "Drafts", count: counts.drafts },
            { value: "past", label: "Past", count: counts.past },
            { value: "all", label: "All", count: events.length },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-4 py-8 text-center text-sm text-zinc-500">
          {query ? <>No events match &ldquo;{query}&rdquo;.</> : "Nothing here yet."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {slice.map((ev) => (
            <li key={ev.id}>
              <EventCard ev={ev} now={now} onDeleted={() => onDeleted(ev.id)} />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-zinc-500">
            Page {current + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function EventCard({ ev, now, onDeleted }: { ev: EventSummary; now: number; onDeleted: () => void }) {
  const phase = eventPhase(ev, now);
  return (
    // Deliberately NOT one big <Link>: edit and delete are buttons, and a
    // button inside an anchor is invalid markup that swallows clicks.
    <article className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm shadow-zinc-900/5 transition hover:border-zinc-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={phase === "past" ? "past" : ev.status} />
            {ev.newResponses > 0 ? (
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                {ev.newResponses} new
              </span>
            ) : null}
          </div>
          <Link
            href={`/dashboard/events/${ev.id}`}
            className="mt-2 block truncate text-base font-semibold text-zinc-900 hover:underline"
          >
            {ev.title}
          </Link>
        </div>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatEventDate(ev.startsAt, ev.timezone)} · {formatRelative(ev.startsAt)}
        </span>
        {ev.locationName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{ev.locationName}</span>
          </span>
        ) : null}
      </p>

      <div className="mt-4 flex-1">
        {ev.status === "draft" ? (
          <p className="text-sm text-amber-700">Publish to start inviting guests.</p>
        ) : (
          <RsvpBar ev={ev} />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
        <Link href={`/dashboard/events/${ev.id}`} className="flex-1">
          <Button size="sm" className="w-full rounded-full sm:w-auto">
            Open
            <ArrowRight className="size-4" />
          </Button>
        </Link>
        <Link href={`/dashboard/events/${ev.id}/edit`}>
          <Button variant="outline" size="sm" className="rounded-full" aria-label={`Edit ${ev.title}`}>
            <Pencil className="size-4" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </Link>
        <DeleteEventButton eventId={ev.id} title={ev.title} onDeleted={onDeleted} />
      </div>
    </article>
  );
}

// --- greetings --------------------------------------------------------------

function GreetingsTeaser({ greetings }: { greetings: GreetingSummary[] }) {
  return (
    <Panel
      title="Greeting cards"
      icon={MessageSquareHeart}
      description="A designed card with a message: a thank-you, a season's greeting, a hello. No date or RSVP."
      actions={
        <>
          {greetings.length > 0 ? (
            <Link href="/dashboard/greetings">
              <Button variant="outline" size="sm" className="rounded-full">
                All greetings ({greetings.length})
              </Button>
            </Link>
          ) : null}
          <Link href="/dashboard/greetings/new">
            <Button size="sm" className="rounded-full">
              <Plus className="size-4" />
              New greeting
            </Button>
          </Link>
        </>
      }
    >
      {greetings.length === 0 ? (
        <p className="text-sm text-zinc-500">No greetings yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {greetings.slice(0, 3).map((g) => (
            <li key={g.id}>
              <Link
                href={`/dashboard/greetings/${g.id}/edit`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300"
              >
                <span className="block truncate text-sm font-medium text-zinc-900">{g.title}</span>
                <span className="block truncate text-xs text-zinc-500">{g.message ?? g.occasion ?? "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
