import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { clientIp } from "../lib/analytics.js";
import { sendMail, type Mail } from "../lib/mailer.js";
import { rateLimiter } from "../lib/rateLimit.js";

// The web's /contact form. Public and anonymous: it relays one email to
// SUPPORT_EMAIL through the shared mailer gateway, with Reply-To set to the
// person who wrote in, and stores nothing in the database.
//
// Not in publicEvents.ts on purpose — that file is for routes keyed by an event
// slug, and this one touches no event data at all.

const HOUR = 60 * 60_000;
// Per IP: a person with a real question does not send six in an hour.
const perIp = rateLimiter(5, HOUR);
// Overall: bounds a flood of the one inbox however many IPs it comes from, and
// keeps the form from spending this app's daily mail allowance, which guests'
// invitations share.
const overall = rateLimiter(40, HOUR);

const body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(1).max(4000),
  // Honeypot: hidden on the form, so only bots fill it in.
  website: z.string().max(500).optional(),
});

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildContactEmail(o: {
  to: string;
  name: string;
  email: string;
  message: string;
  userId?: string;
}): Mail {
  const who = `${o.name} <${o.email}>${o.userId ? ` (signed in as host ${o.userId})` : " (not signed in)"}`;
  return {
    to: o.to,
    replyTo: o.email,
    // CR/LF stripped: the name is caller-controlled and lands in a header.
    subject: `RsvpVault contact from ${o.name}`.replace(/[\r\n]+/g, " ").slice(0, 200),
    text: `From: ${who}\n\n${o.message}\n\nReply to this email to answer them.`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;">
  <p style="font-size:13px;color:#6b7280;">From: ${esc(who)}</p>
  <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(o.message)}</p>
  <p style="font-size:13px;color:#6b7280;">Reply to this email to answer them.</p>
</div>`,
  };
}

export async function contactRoutes(app: FastifyInstance) {
  app.post("/contact", { schema: { body } }, async (req, reply) => {
    const b = req.body as z.infer<typeof body>;

    // A bot that filled the honeypot gets the same answer as a success, so it
    // has no signal to adapt to.
    if (b.website?.trim()) return reply.code(204).send();

    if (!perIp(clientIp(req)) || !overall("all")) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const res = await sendMail(
      [
        buildContactEmail({
          to: env.SUPPORT_EMAIL,
          name: b.name,
          email: b.email,
          message: b.message,
          userId: req.userId,
        }),
      ],
      (msg) => req.log.info(msg),
    );

    // Not fail-soft, unlike invitations: telling someone "sent" when nobody
    // will read it is worse than asking them to email us directly.
    if (!res.delivered) return reply.code(503).send({ error: "mailer_unavailable" });
    return reply.code(204).send();
  });
}
