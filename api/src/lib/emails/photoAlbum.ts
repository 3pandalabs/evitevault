import type { Event, Guest } from "../../db/schema.js";
import { env } from "../../env.js";
import type { Mail } from "../mailer.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "Here are the photos" — sent after the event, once the host has an album to
 * point at.
 *
 * It gets its own template rather than riding on a plain announcement because
 * the whole point is the button: a bare URL pasted into an announcement body
 * arrives as unclickable text in the HTML part, which is exactly the friction
 * that stops people opening it on a phone.
 *
 * `albumUrl` is host-supplied but validated as http(s) on the way into the
 * events table, so it can't be a javascript: URL here. It is escaped anyway —
 * a quote in the URL would otherwise break out of the href attribute.
 */
export function buildPhotoAlbumEmail(
  event: Event,
  guest: Guest,
  albumUrl: string,
  message: string | null,
): Mail {
  const personalUrl = `${env.WEB_ORIGIN}/e/${event.slug}?t=${guest.inviteToken}`;
  const subject = `Photos from ${event.title}`;
  const note = message?.trim() || null;

  const text = [
    subject,
    "",
    note,
    note ? "" : null,
    "Open the album:",
    albumUrl,
    "",
    "The invitation, if you want to look back at it:",
    personalUrl,
    "",
    "—",
    "Sent with RsvpVault — free digital invitations and RSVP tracking.",
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
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">The photos are up</p>
            <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;">${esc(event.title)}</h1>

            ${note ? `<p style="margin:0 0 20px;white-space:pre-line;font-size:15px;line-height:1.6;">${esc(note)}</p>` : ""}

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
              <tr>
                <td style="background:#b45309;border-radius:10px;">
                  <a href="${esc(albumUrl)}"
                     style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">
                    Open the photo album
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
              Add your own pictures to the album too — and the
              <a href="${personalUrl}" style="color:#b45309;">invitation</a> is still there if you
              want to look back at it.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #eee;padding-top:18px;">
              <tr><td style="font-size:12px;color:#9ca3af;line-height:1.6;">
                Sent with <a href="${esc(env.WEB_ORIGIN)}" style="color:#b45309;text-decoration:none;font-weight:600;">RsvpVault</a>
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

  return { to: guest.email!, subject, html, text };
}
