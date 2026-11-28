import type { Mail } from "../mailer.js";

// Cash gift emails, sent once when a gift's checkout is paid (the webhook's
// conditional pending -> paid UPDATE is what makes "once" true):
//   - to the host: "You got a gift" (amount, who, their message)
//   - to the guest: a plain receipt with the full breakdown
// Pure builders (no env import) so they are testable; the caller passes the
// web origin.

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const FOOTER_TEXT = ["", "—", "RsvpVault by 3PandaLabs"];

function shell(title: string, bodyHtml: string, origin: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:32px;">
          <tr><td>
            <h1 style="margin:0 0 16px;font-size:22px;">${esc(title)}</h1>
            ${bodyHtml}
            <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;">
              <a href="${esc(origin)}" style="color:#9ca3af;">RsvpVault</a> by 3PandaLabs
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

const TEST_NOTE = "Test mode: no real money moved.";

export type GiftReceivedInput = {
  to: string;
  origin: string;
  eventId: string;
  eventTitle: string;
  guestName: string | null;
  guestMessage: string | null;
  amountCents: number;
  testMode: boolean;
};

export function buildGiftReceivedEmail(g: GiftReceivedInput): Mail {
  const who = g.guestName ?? "A guest";
  const link = `${g.origin}/dashboard/events/${g.eventId}`;
  const subject = `${g.testMode ? "[Test] " : ""}You got a ${money(g.amountCents)} gift for ${g.eventTitle}`.slice(0, 200);
  const text = [
    `${who} sent you a ${money(g.amountCents)} gift for ${g.eventTitle}.`,
    g.guestMessage ? `\nTheir message:\n"${g.guestMessage}"` : null,
    "",
    "The full amount goes to your payout account. It usually reaches your bank about 7 days after the gift is sent.",
    g.testMode ? TEST_NOTE : null,
    "",
    `See your gifts: ${link}`,
    ...FOOTER_TEXT,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const html = shell(
    "You got a gift",
    `<p style="margin:0 0 12px;font-size:16px;">${esc(who)} sent you a <strong>${money(g.amountCents)}</strong> gift for ${esc(g.eventTitle)}.</p>
            ${g.guestMessage ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#faf7f2;border-radius:10px;font-style:italic;">${esc(g.guestMessage)}</blockquote>` : ""}
            <p style="margin:0 0 12px;font-size:14px;color:#4b5563;">The full amount goes to your payout account. It usually reaches your bank about 7 days after the gift is sent.</p>
            ${g.testMode ? `<p style="margin:0 0 12px;font-size:13px;color:#b45309;">${TEST_NOTE}</p>` : ""}
            <p style="margin:16px 0 0;"><a href="${esc(link)}" style="color:#b45309;font-weight:600;">See your gifts</a></p>`,
    g.origin,
  );
  return { to: g.to, subject, html, text };
}

export type GiftReceiptInput = {
  to: string;
  origin: string;
  slug: string;
  eventTitle: string;
  hostName: string | null;
  amountCents: number;
  platformFeeCents: number;
  cardFeeCents: number;
  totalCents: number;
  testMode: boolean;
};

export function buildGiftReceiptEmail(g: GiftReceiptInput): Mail {
  const host = g.hostName ?? "the host";
  const fees = g.platformFeeCents + g.cardFeeCents;
  const link = `${g.origin}/e/${g.slug}`;
  const subject = `${g.testMode ? "[Test] " : ""}Your gift receipt: ${g.eventTitle}`.slice(0, 200);
  const rows: [string, string][] = [
    [`Gift to ${host}`, money(g.amountCents)],
    ["Card processing and service fee", money(fees)],
    ["Total paid", money(g.totalCents)],
  ];
  const text = [
    `Thank you. Your gift for ${g.eventTitle} was sent.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `${host} receives the full gift amount. The charge shows on your statement as RsvpVault.`,
    "Gifts can't be refunded, except for a mistake or fraud. Reply to this email if something is wrong.",
    g.testMode ? TEST_NOTE : null,
    "",
    `Invitation: ${link}`,
    ...FOOTER_TEXT,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const table = rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:6px 0;${i === rows.length - 1 ? "font-weight:600;border-top:1px solid #eee;" : ""}">${esc(k)}</td><td align="right" style="padding:6px 0;${i === rows.length - 1 ? "font-weight:600;border-top:1px solid #eee;" : ""}">${v}</td></tr>`,
    )
    .join("");
  const html = shell(
    "Your gift receipt",
    `<p style="margin:0 0 16px;font-size:16px;">Thank you. Your gift for ${esc(g.eventTitle)} was sent.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin:0 0 16px;">${table}</table>
            <p style="margin:0 0 12px;font-size:14px;color:#4b5563;">${esc(host)} receives the full gift amount. The charge shows on your statement as RsvpVault.</p>
            <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Gifts can't be refunded, except for a mistake or fraud. Reply to this email if something is wrong.</p>
            ${g.testMode ? `<p style="margin:0 0 12px;font-size:13px;color:#b45309;">${TEST_NOTE}</p>` : ""}
            <p style="margin:16px 0 0;"><a href="${esc(link)}" style="color:#b45309;font-weight:600;">Back to the invitation</a></p>`,
    g.origin,
  );
  return { to: g.to, subject, html, text };
}
