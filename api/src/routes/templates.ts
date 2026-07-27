import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { eventTemplates } from "../db/schema.js";
import { themeSchema } from "../lib/theme.js";

const templateBody = z.object({
  key: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens only"),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  category: z.string().max(60).default("general"),
  theme: themeSchema,
});

export async function templateRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // System templates plus the caller's own. A host never sees another host's
  // saved designs.
  app.get("/templates", async (req) => {
    const rows = await db
      .select()
      .from(eventTemplates)
      .where(or(isNull(eventTemplates.createdBy), eq(eventTemplates.createdBy, req.userId!)))
      .orderBy(asc(eventTemplates.sortOrder), asc(eventTemplates.name));
    return { templates: rows };
  });

  app.post(
    "/templates",
    { schema: { body: templateBody } },
    async (req, reply) => {
      const body = req.body as z.infer<typeof templateBody>;

      // Host templates are always isSystem=false with createdBy set — the CHECK
      // constraint on the table enforces the pairing, but setting it here means
      // a host can't smuggle a template into every other host's picker.
      const [created] = await db
        .insert(eventTemplates)
        .values({
          key: `${req.userId!.slice(0, 8)}-${body.key}`,
          name: body.name,
          description: body.description ?? null,
          category: body.category,
          theme: body.theme,
          isSystem: false,
          createdBy: req.userId!,
        })
        .onConflictDoNothing({ target: eventTemplates.key })
        .returning();

      if (!created) return reply.code(409).send({ error: "template_key_taken" });
      return reply.code(201).send(created);
    },
  );

  app.delete(
    "/templates/:templateId",
    { schema: { params: z.object({ templateId: z.string().uuid() }) } },
    async (req, reply) => {
      const { templateId } = req.params as { templateId: string };
      // createdBy in the predicate is what stops a host deleting a system
      // template — those have createdBy null, so the equality never matches
      // and the caller gets the same 404 as for a template that isn't theirs.
      const deleted = await db
        .delete(eventTemplates)
        .where(and(eq(eventTemplates.id, templateId), eq(eventTemplates.createdBy, req.userId!)))
        .returning({ id: eventTemplates.id });

      if (deleted.length === 0) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );
}
