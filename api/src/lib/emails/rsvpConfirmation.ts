import type { Event, Guest } from "../../db/schema.js";
import { env } from "../../env.js";
import { googleCalendarUrl } from "../ics.js";
import type { Mail } from "../mailer.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(event: Event): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: event.timezone,
  }).format(event.startsAt);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
    timeZoneName: "short",
  }).format(event.startsAt);
  return `${date} at ${time}`;
}

const HEADLINE: Record<string, string> = {
  attending: "You're going",
  maybe: "You're a maybe",
  declined: "You've declined",
};

export function buildRsvpConfirmationEmail(event: Event, guest: Guest): Mail {
  const personalUrl = `${env.WEB_ORIGIN}/e/${event.slug}?t=${guest.inviteToken}`;
  const when = formatWhen(event);
  const where = [event.locationName, event.locationAddress].filter(Boolean).join(", ");
  const going = guest.rsvpStatus === "attending";
  const headline = HEADLINE[guest.rsvpStatus] ?? "Your response is recorded";
  const party = 1 + guest.plusOnes;
  const names = guest.plusOneNames?.filter(Boolean) ?? [];

  // Calendar links only for guests actually coming. Inviting someone who just
  // declined to save the date is tone-deaf, and it's the kind of detail that
  // makes an automated email feel automated.
  const calendarBlock = going
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="background:#b45309;border-radius:10px;">
            <a href="${googleCalendarUrl({ ...event, url: personalUrl, organizerName: event.hostDisplayName })}"
               style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">
              Add to Google Calendar
            </a>
          </td>
          <td style="width:10px;"></td>
          <td style="border:1px solid #ddd;border-radius:10px;">
            <a href="${env.WEB_ORIGIN}/e/${event.slug}/calendar.ics"
               style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#1f2937;text-decoration:none;">
              Apple / Outlook
            </a>
          </td>
        </tr>
      </table>`
    : "";

  const text = [
    `${headline} — ${event.title}`,
    "",
    `When: ${when}`,
    where ? `Where: ${where}` : null,
    going ? `Party: ${party} ${party === 1 ? "person" : "people"}` : null,
    going && names.length ? `Bringing: ${names.join(", ")}` : null,
    guest.dietaryNotes ? `Dietary: ${guest.dietaryNotes}` : null,
    "",
    "Need to change your answer? Use your personal link:",
    personalUrl,
    "",
    "—",
    "Sent with EviteVault — free digital invitations and RSVP tracking.",
    env.WEB_ORIGIN,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${esc(headline)}</p>
            <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;">${esc(event.title)}</h1>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
              <tr><td style="padding:4px 0;color:#6b7280;width:90px;">When</td><td style="padding:4px 0;font-weight:600;">${esc(when)}</td></tr>
              ${where ? `<tr><td style="padding:4px 0;color:#6b7280;">Where</td><td style="padding:4px 0;">${esc(where)}</td></tr>` : ""}
              ${going ? `<tr><td style="padding:4px 0;color:#6b7280;">Party</td><td style="padding:4px 0;">${party} ${party === 1 ? "person" : "people"}</td></tr>` : ""}
              ${going && names.length ? `<tr><td style="padding:4px 0;color:#6b7280;">Bringing</td><td style="padding:4px 0;">${esc(names.join(", "))}</td></tr>` : ""}
              ${guest.dietaryNotes ? `<tr><td style="padding:4px 0;color:#6b7280;">Dietary</td><td style="padding:4px 0;">${esc(guest.dietaryNotes)}</td></tr>` : ""}
            </table>

            ${calendarBlock}

            <p style="margin:20px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
              Changed your mind? <a href="${personalUrl}" style="color:#b45309;">Update your response</a> any time —
              this link is personal to you.
            </p>

            <!-- Product footer. Deliberately one line: this is a transactional
                 message, and loading it with marketing is how a confirmation
                 gets reclassified as promotional and stops reaching inboxes. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #eee;padding-top:18px;">
              <tr><td style="font-size:12px;color:#9ca3af;line-height:1.6;">
                Sent with <a href="${esc(env.WEB_ORIGIN)}" style="color:#b45309;text-decoration:none;font-weight:600;">EviteVault</a>
                — free digital invitations with RSVP tracking, a guestbook and QR sharing.
                <br />
                <a href="${esc(env.WEB_ORIGIN)}" style="color:#9ca3af;">Create your own invitation →</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to: guest.email!, subject: `${headline} — ${event.title}`, html, text };
}
