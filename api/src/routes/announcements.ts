import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { announcements, guests } from "../db/schema.js";
import { env } from "../env.js";
import { sendMail, type Mail } from "../lib/mailer.js";
import { loadOwnedEvent } from "../lib/ownership.js";

const eventParams = z.object({ eventId: z.string().uuid() });
const AUDIENCES = ["all", "attending", "pending", "maybe", "declined"] as const;

// The announcement body is host-supplied and this markup is delivered to third
// parties, so it is escaped before interpolation.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function announcementRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/events/:eventId/announcements", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.eventId, eventId))
      .orderBy(desc(announcements.createdAt));
    return { announcements: rows };
  });

  app.post(
    "/events/:eventId/announcements",
    {
      schema: {
        params: eventParams,
        body: z.object({
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(10_000),
          audience: z.enum(AUDIENCES).default("all"),
        }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { subject, body, audience } = req.body as {
        subject: string;
        body: string;
        audience: (typeof AUDIENCES)[number];
      };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      const recipients = await db
        .select({ name: guests.name, email: guests.email, inviteToken: guests.inviteToken })
        .from(guests)
        .where(
          audience === "all"
            ? and(eq(guests.eventId, eventId), isNotNull(guests.email))
            : and(eq(guests.eventId, eventId), isNotNull(guests.email), eq(guests.rsvpStatus, audience)),
        );

      // The row is written before the send so a partial or failed delivery is
      // still visible to the host rather than disappearing.
      const [record] = await db
        .insert(announcements)
        .values({ eventId, subject, body, audience, recipientCount: recipients.length })
        .returning();

      // Each recipient gets their own personalised link so clicking through
      // from an announcement lands them on their own RSVP, already identified.
      const messages: Mail[] = recipients.map((r) => {
        const url = `${env.WEB_ORIGIN}/e/${event.slug}?t=${r.inviteToken}`;
        return {
          to: r.email!,
          subject,
          text: `${body}\n\n---\n${event.title}\n${url}`,
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:520px;">
  <p style="white-space:pre-line;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
  <p style="font-size:14px;"><strong>${escapeHtml(event.title)}</strong></p>
  <p style="font-size:14px;"><a href="${url}" style="color:#b45309;">View the invitation</a></p>
</div>`,
        };
      });

      const result = await sendMail(messages, (msg) => req.log.info({ eventId }, msg));

      const [updated] = await db
        .update(announcements)
        .set({ sentAt: new Date() })
        .where(eq(announcements.id, record.id))
        .returning();

      return reply.code(201).send({ ...updated, delivered: result.delivered, skipped: result.skipped });
    },
  );
}
