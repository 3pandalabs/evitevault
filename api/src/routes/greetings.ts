import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { eventTemplates, greetings } from "../db/schema.js";
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
