import type { Attachment, Mail } from "../mailer.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A greeting delivered by email. Unlike an invitation there is no link, no QR
 * and no RSVP — the whole message is the card and whatever the host wrote. The
 * card image is inlined via `cid:` (same mechanism as the invitation QR), so it
 * shows inside the email rather than as a downloadable attachment.
 *
 * The image is rendered in the browser and rides along with the send request;
 * nothing is stored server-side, which is why this builder takes the bytes
 * rather than an R2 key.
 */
export function buildGreetingEmail(opts: {
  to: string;
  title: string;
  message: string | null;
  fromName: string | null;
  image?: { content: string; type: string };
}): Mail {
  const { to, title, message, fromName, image } = opts;

  const attachments: Attachment[] = [];
  let imageHtml = "";
  if (image) {
    const ext = image.type === "image/gif" ? "gif" : image.type === "image/png" ? "png" : "jpg";
    attachments.push({
      content: image.content,
      filename: `greeting.${ext}`,
      type: image.type,
      disposition: "inline",
      contentId: "greeting-card",
    });
    imageHtml = `<img src="cid:greeting-card" alt="${esc(title)}" style="display:block;width:100%;max-width:420px;height:auto;border-radius:14px;margin:0 auto;" />`;
  }

  const messageHtml = message ? esc(message).replace(/\n/g, "<br>") : "";
  const fromHtml = fromName
    ? `<p style="font-size:13px;color:#6b7280;margin:18px 0 0;">From ${esc(fromName)}</p>`
    : "";

  const text = [
    title,
    ...(message ? ["", message] : []),
    ...(fromName ? ["", `From ${fromName}`] : []),
    "",
    "Sent with RsvpVault — rsvpvault.3pandalabs.com",
  ].join("\n");

  return {
    to,
    subject: title,
    text,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:480px;margin:0 auto;padding:8px;text-align:center;">
  ${imageHtml}
  ${messageHtml ? `<p style="font-size:15px;line-height:1.6;margin:22px 0 0;text-align:left;">${messageHtml}</p>` : ""}
  ${fromHtml}
  <p style="font-size:12px;color:#9ca3af;margin:30px 0 0;">Sent with RsvpVault</p>
</div>`,
    attachments: attachments.length ? attachments : undefined,
  };
}
