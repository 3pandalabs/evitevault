import type { Event, Guest } from "../../db/schema.js";
import { env } from "../../env.js";
import { formatEventWhen } from "../eventTime.js";
import { googleCalendarUrl, outlookCalendarUrl } from "../ics.js";
import { mapLinkFor } from "../features/reminders.js";
import type { Mail } from "../mailer.js";

// Emails for the free host features (migration 0015): the day-before
// reminder, a waitlist approval, a date picked by poll, a co-host invitation.
// Same plain transactional layout as the RSVP confirmation; one product line
// in the footer, nothing more.

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Row = [label: string, value: string, href?: string | null];
type Button = { label: string; href: string; primary?: boolean };

function layout(opts: { kicker: string; title: string; intro?: string; rows: Row[]; buttons: Button[]; outro?: string }): string {
  const rows = opts.rows
    .map(
      ([k, v, href]) =>
        `<tr><td style="padding:4px 0;color:#6b7280;width:90px;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;font-weight:600;">${
          href ? `<a href="${esc(href)}" style="color:#1f2937;">${esc(v)}</a>` : esc(v)
        }</td></tr>`,
    )
    .join("");
  const buttons = opts.buttons
    .map((b) =>
      b.primary
        ? `<a href="${esc(b.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:10px;background:#b45309;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">${esc(b.label)}</a>`
        : `<a href="${esc(b.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 19px;border-radius:10px;border:1px solid #ddd;color:#1f2937;font-size:15px;font-weight:600;text-decoration:none;">${esc(b.label)}</a>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${esc(opts.kicker)}</p>
            <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${esc(opts.title)}</h1>
            ${opts.intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(opts.intro)}</p>` : ""}
            ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">${rows}</table>` : ""}
            <div style="margin:22px 0 6px;">${buttons}</div>
            ${opts.outro ? `<p style="margin:12px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">${esc(opts.outro)}</p>` : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #eee;padding-top:18px;">
              <tr><td style="font-size:12px;color:#9ca3af;line-height:1.6;">
                Sent with <a href="${esc(env.WEB_ORIGIN)}" style="color:#b45309;text-decoration:none;font-weight:600;">RsvpVault</a> — free digital invitations with RSVP tracking.
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function personalUrl(event: Event, guest: Guest): string {
  return `${env.WEB_ORIGIN}/e/${event.slug}?t=${guest.inviteToken}`;
}

function where(event: Event): string {
  return [event.locationName, event.locationAddress].filter(Boolean).join(", ");
}

function calendarButtons(event: Event, url: string): Button[] {
  const input = { ...event, url, organizerName: event.hostDisplayName };
  return [
    { label: "Google Calendar", href: googleCalendarUrl(input) },
    { label: "Outlook", href: outlookCalendarUrl(input) },
    { label: "Apple (.ics)", href: `${env.WEB_ORIGIN}/e/${event.slug}/calendar.ics` },
  ];
}

export function buildReminderEmail(event: Event, guest: Guest): Mail {
  const url = personalUrl(event, guest);
  const when = formatEventWhen(event.startsAt, event.timezone);
  const place = where(event);
  const map = mapLinkFor(event);
  const rows: Row[] = [["When", when]];
  if (place) rows.push(["Where", place, map]);
  else if (map) rows.push(["Map", "Open map", map]);
  const buttons: Button[] = [{ label: "Open your invitation", href: url, primary: true }];
  if (map) buttons.push({ label: "Directions", href: map });
  buttons.push(...calendarButtons(event, url));
  const html = layout({
    kicker: "Reminder",
    title: `${event.title} is coming up`,
    intro: `Hi ${guest.name.split(" ")[0]}, a quick reminder that you said you're ${guest.rsvpStatus === "maybe" ? "a maybe" : "coming"}.`,
    rows,
    buttons,
    outro: "Plans changed? Update your reply from your invitation so the host knows. This is the only reminder we send.",
  });
  const text = [
    `Reminder: ${event.title}`,
    "",
    `When: ${when}`,
    place ? `Where: ${place}` : null,
    map ? `Map: ${map}` : null,
    "",
    `Your invitation (update your reply): ${url}`,
    `Add to calendar: ${env.WEB_ORIGIN}/e/${event.slug}/calendar.ics`,
    "",
    "This is the only reminder we send.",
    "—",
    "Sent with RsvpVault.",
  ]
    .filter((l) => l !== null)
    .join("\n");
  return { to: guest.email!, subject: `Reminder: ${event.title} — ${when}`, html, text };
}

export function buildApprovalEmail(event: Event, guest: Guest): Mail {
  const url = personalUrl(event, guest);
  const when = formatEventWhen(event.startsAt, event.timezone);
  const place = where(event);
  const rows: Row[] = [["When", when]];
  if (place) rows.push(["Where", place, mapLinkFor(event)]);
  const html = layout({
    kicker: "You're in",
    title: event.title,
    intro: `Good news, ${guest.name.split(" ")[0]}: the host has confirmed your place.`,
    rows,
    buttons: [{ label: "Open your invitation", href: url, primary: true }, ...calendarButtons(event, url)],
    outro: "Can't make it after all? Update your reply from your invitation.",
  });
  const text = [`You're in: ${event.title}`, "", `When: ${when}`, place ? `Where: ${place}` : null, "", `Your invitation: ${url}`, "—", "Sent with RsvpVault."]
    .filter((l) => l !== null)
    .join("\n");
  return { to: guest.email!, subject: `You're in — ${event.title}`, html, text };
}

export function buildDatePickedEmail(event: Event, guest: Guest): Mail {
  const url = personalUrl(event, guest);
  const when = formatEventWhen(event.startsAt, event.timezone);
  const place = where(event);
  const rows: Row[] = [["When", when]];
  if (place) rows.push(["Where", place, mapLinkFor(event)]);
  const html = layout({
    kicker: "Date confirmed",
    title: event.title,
    intro: `The host picked a date. Let them know if you can make it.`,
    rows,
    buttons: [{ label: "Reply on your invitation", href: url, primary: true }, ...calendarButtons(event, url)],
  });
  const text = [`Date confirmed: ${event.title}`, "", `When: ${when}`, place ? `Where: ${place}` : null, "", `Reply here: ${url}`, "—", "Sent with RsvpVault."]
    .filter((l) => l !== null)
    .join("\n");
  return { to: guest.email!, subject: `Date confirmed — ${event.title}: ${when}`, html, text };
}

export function buildCohostInviteEmail(event: Event, invite: { name: string; email: string; inviteToken: string }, inviterName: string | null): Mail {
  const url = `${env.WEB_ORIGIN}/cohost?token=${invite.inviteToken}`;
  const when = formatEventWhen(event.startsAt, event.timezone);
  const by = inviterName?.trim() || "The host";
  const html = layout({
    kicker: "Co-host invitation",
    title: event.title,
    intro: `${by} asked you to help host this event on RsvpVault: manage the guest list, replies and the guest page together.`,
    rows: [["When", when]],
    buttons: [{ label: "Accept", href: url, primary: true }],
    outro: `Sign in (or create a free account) with ${invite.email} to accept. If you weren't expecting this, ignore it.`,
  });
  const text = [
    `${by} invited you to co-host "${event.title}" on RsvpVault.`,
    "",
    `When: ${when}`,
    "",
    `Accept: ${url}`,
    `Sign in or create a free account with ${invite.email}.`,
    "—",
    "Sent with RsvpVault.",
  ].join("\n");
  return { to: invite.email, subject: `Co-host "${event.title}" with ${by}`, html, text };
}
