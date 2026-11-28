import { and, eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { eventCohosts, events, type Event } from "../db/schema.js";
import { canPerform, type EventAction, type EventRole } from "./features/cohosts.js";

// The owner OR an accepted co-host (migration 0015). Same 404-not-403 rule as
// loadOwnedEvent: an event you cannot manage is indistinguishable from one
// that does not exist. Routes that must stay owner-only (delete, paid
// features, co-host management) keep using loadOwnedEvent, or pass an action
// a co-host is not allowed (lib/features/cohosts.ts canPerform).
export async function eventRoleFor(event: Pick<Event, "id" | "hostId">, userId: string): Promise<EventRole | null> {
  if (event.hostId === userId) return "owner";
  const [row] = await db
    .select({ id: eventCohosts.id })
    .from(eventCohosts)
    .where(and(eq(eventCohosts.eventId, event.id), eq(eventCohosts.userId, userId), eq(eventCohosts.status, "accepted")))
    .limit(1);
  return row ? "cohost" : null;
}

export async function loadManagedEvent(
  eventId: string,
  userId: string,
  reply: FastifyReply,
  action: EventAction = "manage_guests",
): Promise<(Event & { myRole: EventRole }) | null> {
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const role = row ? await eventRoleFor(row, userId) : null;
  if (!row || !role) {
    reply.code(404).send({ error: "not_found" });
    return null;
  }
  if (!canPerform(role, action)) {
    reply.code(403).send({ error: "owner_only" });
    return null;
  }
  return { ...row, myRole: role };
}
