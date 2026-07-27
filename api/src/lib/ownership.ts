import { and, eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { events, type Event } from "../db/schema.js";

// Every host-facing route that names an event id goes through this. It returns
// 404 (not 403) for an event owned by someone else, so the endpoint can't be
// used to probe which event ids exist.
export async function loadOwnedEvent(
  eventId: string,
  userId: string,
  reply: FastifyReply,
): Promise<Event | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.hostId, userId)))
    .limit(1);

  if (!row) {
    reply.code(404).send({ error: "not_found" });
    return null;
  }
  return row;
}
