// Converting a wall-clock time in a named timezone to a real instant.
//
// A <input type="datetime-local"> yields "2026-08-15T18:30" with no zone — it
// means "half six in the event's timezone", which is what a host types and what
// the invitation must display. Turning that into a UTC instant is not
// `new Date(value)`: that interprets it in the *browser's* zone, so a host in
// London scheduling a Bengaluru party would store a time 4.5 hours out.
//
// Intl gives the offset without pulling in a date library.

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - date.getTime();
}

// Two passes, not one. The offset depends on the instant, and the instant is
// what we're solving for — near a DST boundary a single pass can land an hour
// out. The second pass re-reads the offset at the corrected instant and
// converges. (India has no DST, but the host picks the zone, not us.)
export function zonedWallTimeToUtc(localValue: string, timeZone: string): Date {
  const naive = new Date(`${localValue}:00Z`).getTime();
  let instant = naive;
  for (let i = 0; i < 2; i += 1) {
    instant = naive - tzOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

// The inverse, for pre-filling the form when editing an existing event.
export function utcToZonedWallTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + tzOffsetMs(d, timeZone));
  return shifted.toISOString().slice(0, 16);
}

// Intl.supportedValuesOf is available everywhere this app runs, but it is a
// relatively recent addition — fall back to a short list rather than rendering
// an empty <select> if it's missing.
const FALLBACK_ZONES = [
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

export function timeZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf;
  try {
    return supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
