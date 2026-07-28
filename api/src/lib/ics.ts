import type { Event } from "../db/schema.js";

// RFC 5545 requires CRLF line endings and folding at 75 octets. Plenty of
// clients tolerate LF, but Outlook is not one of them — it silently refuses the
// file rather than erroring, which looks like "Add to Calendar is broken".
const CRLF = "\r\n";

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join(CRLF);
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type IcsInput = Pick<
  Event,
  "id" | "title" | "description" | "startsAt" | "endsAt" | "locationName" | "locationAddress"
> & { url: string; organizerName?: string | null };

export function buildIcs(ev: IcsInput): string {
  // Timestamps are emitted in UTC (the trailing Z) rather than with a TZID and
  // an embedded VTIMEZONE block. The absolute instant is what matters for a
  // calendar entry, and every client renders it in the viewer's own zone —
  // which is the correct behaviour for a guest travelling to the event. The
  // event's local time is still shown on the invitation page itself.
  const end = ev.endsAt ?? new Date(ev.startsAt.getTime() + 2 * 60 * 60 * 1000);
  const location = [ev.locationName, ev.locationAddress].filter(Boolean).join(", ");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//3PandaLabs//RsvpVault//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@evitevault.3pandalabs.com`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(ev.startsAt)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    ev.description ? `DESCRIPTION:${escapeText(ev.description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    `URL:${escapeText(ev.url)}`,
    ev.organizerName ? `ORGANIZER;CN=${escapeText(ev.organizerName)}:MAILTO:noreply@evitevault.3pandalabs.com` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);

  return lines.map(foldLine).join(CRLF) + CRLF;
}

// Google Calendar's template URL. Apple/Outlook get the .ics file instead —
// neither has a comparable stable "add event" URL scheme.
export function googleCalendarUrl(ev: IcsInput): string {
  const end = ev.endsAt ?? new Date(ev.startsAt.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${toUtcStamp(ev.startsAt)}/${toUtcStamp(end)}`,
    details: [ev.description, ev.url].filter(Boolean).join("\n\n"),
    location: [ev.locationName, ev.locationAddress].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
