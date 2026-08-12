/**
 * Event date/time: when an event is over, and how its times are written in
 * outbound email.
 *
 * Deliberately mirrors `web/src/lib/utils.ts`: an invitation email and the
 * invitation page it links to must not disagree about what time the party
 * starts. When one changes, change the other.
 *
 * Always the event's own timezone, never the reader's — an invitation that
 * says 7 PM must say 7 PM to everyone, which is why the zone is named
 * explicitly rather than converted away.
 */

/**
 * How long an event is assumed to run when the host never gave an end time.
 *
 * `events.ends_at` is optional and most hosts leave it blank, so without a
 * fallback an event would keep accepting RSVPs forever — guests "confirming"
 * attendance at a party that finished last month, landing in a headcount the
 * host stopped looking at. Three hours is the span of an ordinary dinner,
 * birthday or house party, and erring long is the safe direction: a late
 * arrival can still say they're coming, and the deadline only ever closes
 * something that has already happened.
 */
export const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

/** The moment an event is over: the host's own end time, or start + 3 hours. */
export function eventEndsAt(event: { startsAt: Date; endsAt: Date | null }): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
}

/**
 * Whether the event is in the past. The API is the only place this is decided —
 * a guest's clock is not to be trusted with it, and the invitation page reads
 * the answer off the response rather than recomputing it.
 */
export function hasEventEnded(
  event: { startsAt: Date; endsAt: Date | null },
  now: Date = new Date(),
): boolean {
  return eventEndsAt(event).getTime() <= now.getTime();
}

export function formatEventDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(at);
}

// en-US purely for the clock: both locales support hour12, but en-GB renders
// lowercase "7:00 pm" where en-US gives the uppercase form. Dates stay en-GB
// above so they keep day-before-month.
export function formatEventTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(at);
}

function zoneName(at: Date, timeZone: string, style: "long" | "shortOffset"): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: style })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
  } catch {
    return undefined;
  }
}

/**
 * "India Standard Time (GMT+5:30)".
 *
 * `timeZoneName: "short"` — what these emails used to carry — only produces a
 * familiar abbreviation for US zones. Everywhere else it degrades to a raw
 * offset, so Asia/Kolkata read as "GMT+5:30" and told the guest nothing.
 */
export function formatTimeZoneLabel(at: Date, timeZone: string): string {
  const long = zoneName(at, timeZone, "long");
  const offset = zoneName(at, timeZone, "shortOffset");

  if (long && offset && long !== offset) return `${long} (${offset})`;
  return long ?? offset ?? timeZone;
}

/** "Saturday, 15 August 2026 at 7:00 PM India Standard Time (GMT+5:30)" */
export function formatEventWhen(at: Date, timeZone: string): string {
  return `${formatEventDate(at, timeZone)} at ${formatEventTime(at, timeZone)} ${formatTimeZoneLabel(at, timeZone)}`;
}
