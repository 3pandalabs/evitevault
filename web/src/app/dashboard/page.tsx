"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  MessageSquareHeart,
  Pencil,
  Plus,
  Search,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEventDate, formatRelative } from "@/lib/utils";
import { DeleteEventButton } from "./events/delete-event-button";
import { DeleteGreetingButton } from "./greetings/delete-greeting-button";

// How many rows each section shows before paging. The lists also scroll inside
// a bounded height, so a page of five never pushes the other section off-screen.
const PER_PAGE = 5;

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [greetings, setGreetings] = useState<GreetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Events gate the page; greetings are best-effort. The greetings endpoint
    // ships in a separate API deploy, so a web rollout that lands first must
    // still render the events dashboard rather than erroring on a 404 — the
    // section simply shows empty until the API catches up.
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
  if (!events || !greetings) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-14">
      <EventsSection
        events={events}
        onDeleted={(id) => setEvents((cur) => (cur ?? []).filter((e) => e.id !== id))}
      />
      <GreetingsSection
        greetings={greetings}
        onDeleted={(id) => setGreetings((cur) => (cur ?? []).filter((g) => g.id !== id))}
      />
    </div>
  );
}

// --- shared section chrome --------------------------------------------------

/** Search + 5-per-page paging over an already-loaded list. */
function usePagedSearch<T>(items: T[], matches: (item: T, q: string) => boolean) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => matches(i, q)) : items;
    // `matches` is a stable inline predicate; re-running on items/query is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // A delete or a new search can drop the current page out of range; clamp
  // rather than render an empty page the user can't navigate away from.
  const current = Math.min(page, pageCount - 1);
  const slice = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  return { query, setQuery, page: current, setPage, pageCount, filtered, slice };
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mt-4">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
        Previous
      </Button>
      <span className="text-slate-500">
        Page {page + 1} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

// --- events -----------------------------------------------------------------

function EventsSection({
  events,
  onDeleted,
}: {
  events: EventSummary[];
  onDeleted: (id: string) => void;
}) {
  const { query, setQuery, page, setPage, pageCount, filtered, slice } = usePagedSearch(
    events,
    (ev, q) => ev.title.toLowerCase().includes(q) || (ev.locationName ?? "").toLowerCase().includes(q),
  );

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your events</h1>
        <Link href="/dashboard/events/new">
          <Button>
            <Plus className="size-4" />
            New event
          </Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="font-medium">No events yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first invitation to start collecting RSVPs.
            </p>
            <Link href="/dashboard/events/new" className="mt-4 inline-block">
              <Button>
                <Plus className="size-4" />
                New event
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search events" />

          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No events match “{query}”.</p>
          ) : (
            <ul className="mt-4 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {slice.map((ev) => (
                <li key={ev.id}>
                  {/* The card is deliberately NOT one big <Link> — edit and
                      delete are buttons, and a button inside an anchor is
                      invalid markup that swallows clicks. The title is the link. */}
                  <Card className="transition hover:border-slate-300 hover:shadow">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/events/${ev.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {ev.title}
                          </Link>
                          {ev.status !== "published" ? (
                            <Badge variant="outline">{ev.status}</Badge>
                          ) : null}
                          {ev.newResponses > 0 ? <Badge>{ev.newResponses} new</Badge> : null}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-3.5" />
                            {formatEventDate(ev.startsAt, ev.timezone)} ({formatRelative(ev.startsAt)})
                          </span>
                          {ev.locationName ? (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="size-3.5" />
                              {ev.locationName}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Users className="size-4 text-slate-400" />
                          {ev.headcount}
                          {ev.capacity ? ` / ${ev.capacity}` : ""}
                        </span>
                        <div className="flex gap-1.5">
                          <Badge variant="attending">{ev.attending} yes</Badge>
                          <Badge variant="maybe">{ev.maybe} maybe</Badge>
                          <Badge variant="pending">{ev.pending} awaiting</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/events/${ev.id}/edit`}>
                            <Button variant="outline" size="sm">
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                          </Link>
                          <DeleteEventButton
                            eventId={ev.id}
                            title={ev.title}
                            onDeleted={() => onDeleted(ev.id)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <Pager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </section>
  );
}

// --- greetings --------------------------------------------------------------

function GreetingsSection({
  greetings,
  onDeleted,
}: {
  greetings: GreetingSummary[];
  onDeleted: (id: string) => void;
}) {
  const { query, setQuery, page, setPage, pageCount, filtered, slice } = usePagedSearch(
    greetings,
    (g, q) =>
      g.title.toLowerCase().includes(q) ||
      (g.message ?? "").toLowerCase().includes(q) ||
      (g.occasion ?? "").toLowerCase().includes(q),
  );

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Your greetings</h2>
        <Link href="/dashboard/greetings/new">
          <Button>
            <Plus className="size-4" />
            New greeting
          </Button>
        </Link>
      </div>

      {greetings.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="font-medium">No greetings yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Design a card with a message — a thank-you, a season&apos;s greeting, a hello.
            </p>
            <Link href="/dashboard/greetings/new" className="mt-4 inline-block">
              <Button>
                <Plus className="size-4" />
                New greeting
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search greetings" />

          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No greetings match “{query}”.</p>
          ) : (
            <ul className="mt-4 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {slice.map((g) => (
                <li key={g.id}>
                  <Card className="transition hover:border-slate-300 hover:shadow">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <MessageSquareHeart className="size-4 shrink-0 text-slate-400" />
                          <Link
                            href={`/dashboard/greetings/${g.id}/edit`}
                            className="truncate font-medium hover:underline"
                          >
                            {g.title}
                          </Link>
                          {g.occasion ? <Badge variant="outline">{g.occasion}</Badge> : null}
                        </div>
                        {g.message ? (
                          <p className="mt-1 truncate text-sm text-slate-500">{g.message}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/greetings/${g.id}/edit`}>
                          <Button variant="outline" size="sm">
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                        </Link>
                        <DeleteGreetingButton
                          greetingId={g.id}
                          title={g.title}
                          onDeleted={() => onDeleted(g.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <Pager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </section>
  );
}
