import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The event's own timezone, not the viewer's. An invitation that says "7pm"
// must say 7pm to everyone — a guest in another country seeing their local
// equivalent is how people miss events. The .ics download is where the
// conversion correctly happens.
export function formatEventDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

// en-US, not the en-GB used for dates above, purely for the clock format: both
// support hour12, but en-GB renders lowercase "7:00 pm" where en-US gives the
// uppercase "7:00 PM" an invitation wants. Dates stay en-GB for day-before-month.
export function formatEventTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}

// Pulls just the zone name out of a formatted date.
function zoneName(
  iso: string,
  timeZone: string,
  style: "long" | "shortOffset",
): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: style })
      .formatToParts(new Date(iso))
      .find((p) => p.type === "timeZoneName")?.value;
  } catch {
    // shortOffset needs a reasonably current ICU. Falling back to no label
    // beats throwing on an invitation page.
    return undefined;
  }
}

/**
 * "India Standard Time (GMT+5:30)".
 *
 * `timeZoneName: "short"` — what the times used to carry — only produces a
 * familiar abbreviation for US zones. Everywhere else it degrades to a raw
 * offset: Asia/Kolkata renders as "GMT+5:30", which tells a guest nothing
 * about which timezone the invitation means. The long name is plain English;
 * the offset stays alongside it for anyone reading from another country.
 */
export function formatTimeZoneLabel(iso: string, timeZone: string): string {
  const long = zoneName(iso, timeZone, "long");
  const offset = zoneName(iso, timeZone, "shortOffset");

  if (long && offset && long !== offset) return `${long} (${offset})`;
  // Some zones have no distinct long name (Asia/Dubai is just "GST"), and a
  // bad ICU may give neither — never render an empty label or bare "()".
  return long ?? offset ?? timeZone;
}

export function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(days) < 1) {
    return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  }
  return rtf.format(days, "day");
}
