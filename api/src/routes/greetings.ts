import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { eventTemplates, greetings } from "../db/schema.js";
import { buildGreetingEmail } from "../lib/emails/greeting.js";
import { mailerConfigured } from "../lib/mailer.js";
import { sendGuestMail } from "../lib/testMode/index.js";
import { loadOwnedGreeting } from "../lib/ownership.js";
import { themeOverridesSchema } from "../lib/theme.js";

// A greeting is the event model with everything guest-facing removed: just a
// title, a message, who it's from, and a chosen design. No timing, location,
// RSVP config, slug or status — see the table comment in db/schema.ts.
const greetingBody = z.object({
  title: z.string().min(1).max(200),
  message: z.string().max(5000).nullish(),
  hostDisplayName: z.string().max(120).nullish(),
  occasion: z.string().max(60).nullish(),
  templateId: z.string().uuid().nullish(),
  themeOverrides: themeOverridesSchema.nullish(),
});

const greetingPatch = greetingBody.partial();

export async function greetingRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // --- list -----------------------------------------------------------------
  // No joins or tallies, unlike /events — a greeting has no children to count.
  app.get("/greetings", async (req) => {
    const rows = await db
      .select({
        id: greetings.id,
        title: greetings.title,
        message: greetings.message,
        hostDisplayName: greetings.hostDisplayName,
        occasion: greetings.occasion,
        templateId: greetings.templateId,
        createdAt: greetings.createdAt,
        updatedAt: greetings.updatedAt,
      })
      .from(greetings)
      .where(eq(greetings.hostId, req.userId!))
      .orderBy(desc(greetings.createdAt));

    return { greetings: rows };
  });

  // --- create ---------------------------------------------------------------
  app.post("/greetings", { schema: { body: greetingBody } }, async (req, reply) => {
    const body = req.body as z.infer<typeof greetingBody>;

    if (body.templateId) {
      const [tpl] = await db
        .select({ id: eventTemplates.id })
        .from(eventTemplates)
        .where(eq(eventTemplates.id, body.templateId))
        .limit(1);
      if (!tpl) return reply.code(400).send({ error: "unknown_template" });
    }

    const [created] = await db
      .insert(greetings)
      .values({ ...body, hostId: req.userId! })
      .returning();

    return reply.code(201).send(created);
  });

  // --- read -----------------------------------------------------------------
  app.get(
    "/greetings/:greetingId",
    { schema: { params: z.object({ greetingId: z.string().uuid() }) } },
    async (req, reply) => {
      const { greetingId } = req.params as { greetingId: string };
      const greeting = await loadOwnedGreeting(greetingId, req.userId!, reply);
      if (!greeting) return;
      return greeting;
    },
  );

  // --- update ---------------------------------------------------------------
  app.patch(
    "/greetings/:greetingId",
    { schema: { params: z.object({ greetingId: z.string().uuid() }), body: greetingPatch } },
    async (req, reply) => {
      const { greetingId } = req.params as { greetingId: string };
      const body = req.body as z.infer<typeof greetingPatch>;

      const greeting = await loadOwnedGreeting(greetingId, req.userId!, reply);
      if (!greeting) return;

      if (body.templateId) {
        const [tpl] = await db
          .select({ id: eventTemplates.id })
          .from(eventTemplates)
          .where(eq(eventTemplates.id, body.templateId))
          .limit(1);
        if (!tpl) return reply.code(400).send({ error: "unknown_template" });
      }

      const [updated] = await db
        .update(greetings)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(greetings.id, greetingId), eq(greetings.hostId, req.userId!)))
        .returning();

      return updated;
    },
  );

  // --- send -----------------------------------------------------------------
  // Email the greeting to a raw list of addresses. Greetings have no guests
  // table and no RSVP, so recipients are not stored — this is a one-shot send,
  // deliberately the small version of the event announcement flow. The card
  // image is rendered in the browser and inlined per message.
  const sendBody = z.object({
    recipients: z
      .array(z.object({ email: z.string().email().max(320), name: z.string().max(120).nullish() }))
      .min(1)
      .max(200),
    // Base64 card image + its mime type. Optional: a text-only greeting sends.
    image: z
      .object({
        content: z.string().max(10_000_000),
        type: z.enum(["image/png", "image/jpeg"]),
      })
      .nullish(),
    // Override the card title as the subject / the saved message as the body.
    subject: z.string().max(200).nullish(),
    message: z.string().max(5000).nullish(),
  });

  app.post(
    "/greetings/:greetingId/send",
    {
      // A base64 card image is a few hundred KB; the default 1 MB body limit
      // would reject the send. No R2 round trip — the browser already rendered
      // the card, so it rides along with the request.
      bodyLimit: 10 * 1024 * 1024,
      schema: { params: z.object({ greetingId: z.string().uuid() }), body: sendBody },
    },
    async (req, reply) => {
      const { greetingId } = req.params as { greetingId: string };
      const body = req.body as z.infer<typeof sendBody>;

      const greeting = await loadOwnedGreeting(greetingId, req.userId!, reply);
      if (!greeting) return;

      const subject = body.subject?.trim() || greeting.title;
      const message = body.message?.trim() ?? greeting.message ?? null;

      const messages = body.recipients.map((r) =>
        buildGreetingEmail({
          to: r.email,
          title: subject,
          message,
          fromName: greeting.hostDisplayName,
          image: body.image ?? undefined,
        }),
      );

      // Guest mail: suppressed in test mode except to the admin (lib/testMode).
      const result = await sendGuestMail(greeting.hostId, messages, (m) => req.log.info({ greetingId }, m));

      return reply.code(201).send({
        recipientCount: body.recipients.length,
        delivered: result.delivered,
        failed: result.failed,
        skipped: result.skipped,
        testSuppressed: result.testSuppressed,
        emailConfigured: mailerConfigured(),
      });
    },
  );

  // --- delete ---------------------------------------------------------------
  app.delete(
    "/greetings/:greetingId",
    { schema: { params: z.object({ greetingId: z.string().uuid() }) } },
    async (req, reply) => {
      const { greetingId } = req.params as { greetingId: string };
      const greeting = await loadOwnedGreeting(greetingId, req.userId!, reply);
      if (!greeting) return;

      await db.delete(greetings).where(eq(greetings.id, greetingId));
      return reply.code(204).send();
    },
  );
}
