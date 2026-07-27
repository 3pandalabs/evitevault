import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { guestbookPosts } from "../db/schema.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { deleteObject, presignDownload } from "../plugins/r2.js";

const eventParams = z.object({ eventId: z.string().uuid() });
const postParams = eventParams.extend({ postId: z.string().uuid() });

// Host-side moderation. The public read of the same table lives in
// publicEvents.ts and only ever returns status='visible'.
export async function guestbookModerationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/events/:eventId/guestbook", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

    const rows = await db
      .select()
      .from(guestbookPosts)
      .where(eq(guestbookPosts.eventId, eventId))
      .orderBy(desc(guestbookPosts.createdAt));

    return {
      posts: await Promise.all(
        rows.map(async ({ imageKey, ...p }) => ({
          ...p,
          imageUrl: imageKey ? await presignDownload(imageKey) : null,
        })),
      ),
    };
  });

  app.patch(
    "/events/:eventId/guestbook/:postId",
    { schema: { params: postParams, body: z.object({ status: z.enum(["visible", "hidden"]) }) } },
    async (req, reply) => {
      const { eventId, postId } = req.params as z.infer<typeof postParams>;
      const { status } = req.body as { status: "visible" | "hidden" };
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const [updated] = await db
        .update(guestbookPosts)
        .set({ status })
        .where(and(eq(guestbookPosts.id, postId), eq(guestbookPosts.eventId, eventId)))
        .returning({ id: guestbookPosts.id, status: guestbookPosts.status });

      if (!updated) return reply.code(404).send({ error: "not_found" });
      return updated;
    },
  );

  app.delete("/events/:eventId/guestbook/:postId", { schema: { params: postParams } }, async (req, reply) => {
    const { eventId, postId } = req.params as z.infer<typeof postParams>;
    if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

    const [deleted] = await db
      .delete(guestbookPosts)
      .where(and(eq(guestbookPosts.id, postId), eq(guestbookPosts.eventId, eventId)))
      .returning({ imageKey: guestbookPosts.imageKey });

    if (!deleted) return reply.code(404).send({ error: "not_found" });

    if (deleted.imageKey) {
      deleteObject(deleted.imageKey).catch((err) =>
        req.log.warn({ err }, "guestbook image not deleted"),
      );
    }
    return reply.code(204).send();
  });
}
