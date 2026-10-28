import { env } from "../env.js";

// Sends through the shared org email gateway (3pandalabs/mailer), not directly
// to a provider.
//
// The gateway is a Cloudflare Worker using the `send_email` binding, which
// authenticates implicitly — so no Cloudflare API token exists in this app's
// environment, in Coolify, or anywhere else. This app holds only MAILER_TOKEN,
// which grants exactly one capability: send email as evitevault's own
// configured sender address.
//
// Templates deliberately stay HERE, not in the gateway. It is a dumb transport;
// it renders nothing and knows nothing about events, guests or invitations.

export type Attachment = {
  content: string; // base64 — the gateway decodes it for the binding
  filename: string;
  type: string;
  disposition: "inline" | "attachment";
  // Required when disposition is "inline": without it the image can't be
  // referenced by a cid: in the HTML and arrives as a dangling file. The
  // gateway rejects inline attachments that omit it.
  contentId?: string;
};

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
};

// `failedRecipients` carries the addresses behind the `failed` count, because
// the number on its own is unusable: a host told "62 failed" out of 100 cannot
// act on it, and the daily send quota makes a partial send a routine outcome
// rather than an edge case — the normal recovery is to re-send to exactly
// those guests tomorrow. Addresses only; mapping them back to guest rows is
// the caller's job, since only the caller knows which list it sent to.
export type SendResult = {
  delivered: number;
  failed: number;
  skipped: number;
  failedRecipients: string[];
};

export function mailerConfigured(): boolean {
  return Boolean(env.MAILER_URL && env.MAILER_TOKEN);
}

// The gateway caps a request at 100 messages; stay well under so a large guest
// list is several modest requests rather than one that risks a timeout.
const BATCH = 50;

// Unconfigured sends are logged and counted as skipped rather than throwing.
// Guests are already saved by the time this runs, and losing a host's guest
// list because an ops secret is missing would be a far worse failure than an
// undelivered invitation.
export async function sendMail(messages: Mail[], log: (msg: string) => void): Promise<SendResult> {
  if (!mailerConfigured()) {
    log(`mailer not configured — ${messages.length} message(s) not delivered`);
    // Not listed as failed recipients: nothing was attempted for any of them,
    // and offering a host a re-send button for a gateway that isn't configured
    // would just fail again. The dashboard says so in words instead.
    return { delivered: 0, failed: 0, skipped: messages.length, failedRecipients: [] };
  }

  let delivered = 0;
  let failed = 0;
  const failedRecipients: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(`${env.MAILER_URL.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.MAILER_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          app: "evitevault",
          messages: batch.map((m) => ({
            to: m.to,
            fromName: env.EMAIL_FROM_NAME || "RsvpVault",
            // `from` is omitted on purpose — the gateway defaults to this app's
            // configured sender, so the address lives in one place rather than
            // being duplicated into this app's environment.
            subject: m.subject,
            html: m.html,
            text: m.text,
            ...(m.attachments?.length ? { attachments: m.attachments } : {}),
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log(`mailer gateway error ${res.status}: ${body.slice(0, 300)}`);
        failed += batch.length;
        // A 429 here is the day's quota running out mid-list, which is the
        // single likeliest way a large guest list half-sends. The whole batch
        // is counted as failed because the gateway rejected the request before
        // any of it was attempted.
        failedRecipients.push(...batch.map((m) => m.to));
        continue;
      }

      // The gateway answers 200 with per-message outcomes even when some
      // failed — a partial failure is not a failed request.
      const result = (await res.json()) as {
        delivered: number;
        failed: number;
        results?: { to: string; ok: boolean; error?: string }[];
      };
      delivered += result.delivered;
      failed += result.failed;

      for (const r of result.results ?? []) {
        if (!r.ok) {
          log(`mail send failed for ${r.to}: ${r.error ?? "unknown"}`);
          failedRecipients.push(r.to);
        }
      }

      // The gateway reported failures without saying which — older responses
      // omit `results` entirely. Rather than report a count the host cannot
      // act on, fall back to naming the whole batch: a redundant re-send to
      // someone who already got it is a far smaller harm than a guest silently
      // never invited.
      if (result.failed > 0 && !result.results) {
        failedRecipients.push(...batch.map((m) => m.to));
      }
    } catch (err) {
      log(`mailer gateway unreachable: ${String(err)}`);
      failed += batch.length;
      failedRecipients.push(...batch.map((m) => m.to));
    }
  }

  return { delivered, failed, skipped: 0, failedRecipients };
}
