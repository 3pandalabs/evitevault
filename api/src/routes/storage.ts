import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import {
  coverImageKey,
  eventIdForKey,
  extForType,
  isAllowedImageType,
  presignDownload,
  presignUpload,
} from "../plugins/r2.js";

export async function storageRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // The key is generated server-side from the event id, never accepted from
  // the client — a client-supplied key is a write primitive over the whole
  // bucket, no matter how carefully it is validated afterwards.
  app.post(
    "/events/:eventId/cover/presign-upload",
    {
      schema: {
        params: z.object({ eventId: z.string().uuid() }),
        body: z.object({ contentType: z.string().max(100) }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const { contentType } = req.body as { contentType: string };
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      if (!isAllowedImageType(contentType)) {
        return reply.code(400).send({ error: "unsupported_content_type" });
      }

      const key = coverImageKey(eventId, extForType(contentType));
      return { key, uploadUrl: await presignUpload(key, contentType) };
    },
  );

  // Reading is authorized by the key's event prefix, so a host can only mint a
  // download URL for objects belonging to an event they own.
  app.post(
    "/storage/presign-download",
    { schema: { body: z.object({ key: z.string().min(1).max(300) }) } },
    async (req, reply) => {
      const { key } = req.body as { key: string };
      const eventId = eventIdForKey(key);
      if (!eventId) return reply.code(400).send({ error: "invalid_key" });
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      return { url: await presignDownload(key) };
    },
  );
}
