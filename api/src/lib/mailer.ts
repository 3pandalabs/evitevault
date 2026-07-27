import { env } from "../env.js";

// Cloudflare Email Sending, via the REST API — this is a Node process on
// Hetzner, not a Worker, so the `send_email` binding isn't available and a
// bearer token is the supported path.
//
// Field names differ from the Workers binding in ways that fail silently if you
// assume they match: `from` takes `address` (not `email`), `reply_to` is
// snake_case (not `replyTo`), and inline attachments use `content_id` (not
// `contentId`).

const ENDPOINT = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

export type Attachment = {
  content: string; // base64
  filename: string;
  type: string;
  disposition: "inline" | "attachment";
  content_id?: string;
};

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
};

export type SendResult = { delivered: number; failed: number; skipped: number };

export function mailerConfigured(): boolean {
  return Boolean(env.EMAIL_ACCOUNT_ID && env.EMAIL_API_TOKEN && env.EMAIL_FROM);
}

async function sendOne(mail: Mail): Promise<void> {
  const res = await fetch(ENDPOINT(env.EMAIL_ACCOUNT_ID), {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EMAIL_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: mail.to,
      from: { address: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME || "EviteVault" },
      subject: mail.subject,
      // Always both. Some clients only render text, and an HTML-only message
      // scores worse with spam filters.
      html: mail.html,
      text: mail.text,
      ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`email send failed: ${res.status} ${body.slice(0, 300)}`);
  }
}

// Unconfigured sends are logged and counted as skipped rather than throwing.
// A host clicking "invite" should not lose their guest list because an ops
// secret is missing — the guests are already saved, and the send can be retried
// once the provider is wired.
export async function sendMail(messages: Mail[], log: (msg: string) => void): Promise<SendResult> {
  if (!mailerConfigured()) {
    log(`mailer not configured — ${messages.length} message(s) not delivered`);
    return { delivered: 0, failed: 0, skipped: messages.length };
  }

  let delivered = 0;
  let failed = 0;

  // Batched rather than one Promise.all over the whole list: a 200-guest event
  // firing 200 simultaneous requests is how an account gets rate-limited on its
  // first real send.
  const BATCH = 10;
  for (let i = 0; i < messages.length; i += BATCH) {
    const results = await Promise.allSettled(messages.slice(i, i + BATCH).map(sendOne));
    for (const r of results) {
      if (r.status === "fulfilled") {
        delivered += 1;
      } else {
        failed += 1;
        log(`mail send failed: ${String(r.reason)}`);
      }
    }
  }

  return { delivered, failed, skipped: 0 };
}
