import { env } from "../env.js";

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export type SendResult = { delivered: number; skipped: number };

// Email delivery is not wired to a provider yet. Rather than throwing (which
// would make "send announcement" fail outright and lose the host's message),
// unconfigured sends are logged and counted as skipped — the announcement row
// is still written with its real recipient count, so the host sees what was
// queued and a later provider integration can replay from it.
//
// When wiring a provider, Cloudflare Email Sending is the org default; keep the
// batching below (one request per recipient is what gets an account
// rate-limited on the first real 200-guest event).
export async function sendMail(messages: Mail[], log: (msg: string) => void): Promise<SendResult> {
  if (!env.EMAIL_API_URL || !env.EMAIL_API_TOKEN || !env.EMAIL_FROM) {
    log(`mailer not configured — ${messages.length} message(s) not delivered`);
    return { delivered: 0, skipped: messages.length };
  }

  let delivered = 0;
  let skipped = 0;
  const BATCH = 20;

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((m) =>
        fetch(env.EMAIL_API_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.EMAIL_API_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text }),
        }).then((res) => {
          if (!res.ok) throw new Error(`mail send failed: ${res.status}`);
        }),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") delivered++;
      else {
        skipped++;
        log(`mail send failed: ${String(r.reason)}`);
      }
    }
  }

  return { delivered, skipped };
}
