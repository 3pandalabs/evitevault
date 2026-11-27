import type { EventSummary } from "@/lib/api/host";

/** Mirrors the API's "effective end": endsAt, or startsAt + 3 hours. */
export function effectiveEnd(ev: Pick<EventSummary, "startsAt" | "endsAt">): number {
  return ev.endsAt ? new Date(ev.endsAt).getTime() : new Date(ev.startsAt).getTime() + 3 * 3600_000;
}

/**
 * Where an event is in the host's journey, for grouping and labels only.
 * draft = not published; past = its day is over (or cancelled/archived);
 * upcoming = published and still ahead. Display only: the API decides
 * whether RSVPs are still open.
 */
export function eventPhase(ev: EventSummary, now = Date.now()): "draft" | "upcoming" | "past" {
  if (ev.status === "draft") return "draft";
  if (ev.status !== "published") return "past";
  return effectiveEnd(ev) < now ? "past" : "upcoming";
}

/** RSVP split as one stacked bar + a legend. */
export function RsvpBar({
  ev,
}: {
  ev: Pick<EventSummary, "attending" | "maybe" | "declined" | "pending" | "invited" | "headcount" | "capacity">;
}) {
  const total = ev.attending + ev.maybe + ev.declined + ev.pending;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-zinc-900">
          {ev.headcount} going{ev.capacity ? <span className="font-normal text-zinc-500"> of {ev.capacity}</span> : null}
        </span>
        <span className="text-xs text-zinc-500">
          {total} {total === 1 ? "guest" : "guests"}
        </span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <span className="bg-emerald-500" style={{ width: pct(ev.attending) }} />
        <span className="bg-amber-400" style={{ width: pct(ev.maybe) }} />
        <span className="bg-rose-400" style={{ width: pct(ev.declined) }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
        <Legend color="bg-emerald-500" label={`${ev.attending} yes`} />
        <Legend color="bg-amber-400" label={`${ev.maybe} maybe`} />
        <Legend color="bg-rose-400" label={`${ev.declined} no`} />
        <Legend color="bg-zinc-300" label={`${ev.pending} awaiting`} />
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
