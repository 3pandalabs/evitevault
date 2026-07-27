import type { Event, Guest } from "../../db/schema.js";
import { env } from "../../env.js";
import type { Mail } from "../mailer.js";
import { qrPngBase64 } from "../qr.js";

// Escaped everywhere it lands in HTML. Event titles, descriptions and guest
// names are host- and guest-supplied, and this markup is delivered to third
// parties — an unescaped apostrophe is cosmetic, an unescaped tag is not.
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

export async function buildInvitationEmail(event: Event, guest: Guest): Promise<Mail> {
  // The guest's own link, not the shared one. Scanning it from a desktop inbox
  // opens their RSVP on their phone already identified, which is the whole
  // point of putting a code in a personally addressed email. (The dashboard's
  // QR is deliberately the shared link — different job: posters and cards.)
  const personalUrl = `${env.WEB_ORIGIN}/e/${event.slug}?t=${guest.inviteToken}`;

  const when = formatWhen(event);
  const where = [event.locationName, event.locationAddress].filter(Boolean).join(", ");
  const hostName = event.hostDisplayName ?? "Your host";
  const qr = await qrPngBase64(personalUrl);

  const text = [
    `${hostName} has invited you to ${event.title}.`,
    "",
    `When: ${when}`,
    where ? `Where: ${where}` : null,
    event.description ? `\n${event.description}` : null,
    "",
    "RSVP here:",
    personalUrl,
    "",
    "This link is personal to you — it opens your RSVP directly.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
    <!-- Tables and inline styles on purpose: Outlook's rendering engine
         ignores most modern CSS, and a flexbox layout collapses there. -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">
                  ${esc(hostName)} invites you
                </p>
                <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#1f2937;">
                  ${esc(event.title)}
                </h1>

                <p style="margin:0 0 6px;font-size:16px;"><strong>${esc(when)}</strong></p>
                ${where ? `<p style="margin:0 0 6px;font-size:15px;color:#6b7280;">${esc(where)}</p>` : ""}
                ${
                  event.description
                    ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.6;white-space:pre-line;">${esc(event.description)}</p>`
                    : ""
                }

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                  <tr>
                    <td style="background:#b45309;border-radius:10px;">
                      <a href="${personalUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">
                        RSVP
                      </a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;padding-top:20px;">
                  <tr>
                    <td width="120" valign="top">
                      <!-- cid: rather than a hosted URL. A remote image would be
                           blocked by default in most clients, and the invitation
                           link is the guest's credential — it has no business in
                           a third-party image proxy's logs. -->
                      <img src="cid:invite-qr" alt="QR code to RSVP" width="110" height="110" style="display:block;border-radius:8px;" />
                    </td>
                    <td valign="middle" style="padding-left:16px;font-size:13px;color:#6b7280;line-height:1.5;">
                      Reading this on a computer? Scan the code with your phone to open your RSVP there.
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                  This link is personal to you and opens your RSVP directly — please don't forward it.
                  <br />
                  Sent by <a href="${esc(env.WEB_ORIGIN)}" style="color:#9ca3af;">EviteVault</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    to: guest.email!,
    subject: `${hostName} invites you to ${event.title}`,
    html,
    text,
    attachments: [
      {
        content: qr,
        filename: "rsvp-qr.png",
        type: "image/png",
        disposition: "inline",
        // camelCase: the gateway mirrors the Workers binding's naming, not the
        // REST API's `content_id`.
        contentId: "invite-qr",
      },
    ],
  };
}
