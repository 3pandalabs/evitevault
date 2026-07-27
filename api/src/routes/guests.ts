import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { guests, rsvpLog } from "../db/schema.js";
import { loadOwnedEvent } from "../lib/ownership.js";

const eventParams = z.object({ eventId: z.string().uuid() });
const guestParams = eventParams.extend({ guestId: z.string().uuid() });

const guestInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(40).nullish(),
});

const guestPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(40).nullish(),
  // A host can correct an RSVP on a guest's behalf — people reply by text
  // message and phone call, not only through the link.
  rsvpStatus: z.enum(["pending", "attending", "declined", "maybe"]).optional(),
  plusOnes: z.number().int().min(0).max(20).optional(),
  dietaryNotes: z.string().max(1000).nullish(),
  message: z.string().max(2000).nullish(),
});

export async function guestRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get(
    "/events/:eventId/guests",
    {
      schema: {
        params: eventParams,
        querystring: z.object({
          status: z.enum(["pending", "attending", "declined", "maybe"]).optional(),
        }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { status } = req.query as { status?: string };
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const rows = await db
        .select()
        .from(guests)
        .where(status ? and(eq(guests.eventId, eventId), eq(guests.rsvpStatus, status)) : eq(guests.eventId, eventId))
        .orderBy(guests.name);

      return { guests: rows };
    },
  );

  // Single add and bulk import share one endpoint: the dashboard's "paste a
  // list of emails" flow and its "add one guest" form differ only in length,
  // and two endpoints would mean two places to keep the dedupe rule correct.
  app.post(
    "/events/:eventId/guests",
    {
      schema: {
        params: eventParams,
        body: z.object({
          guests: z.array(guestInput).min(1).max(500),
          markInvited: z.boolean().default(false),
        }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { guests: input, markInvited } = req.body as {
        guests: z.infer<typeof guestInput>[];
        markInvited: boolean;
      };
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      // Dedupe within the request too. The uq_guests_event_email index catches
      // collisions against existing rows, but a single INSERT containing the
      // same address twice raises "ON CONFLICT DO UPDATE command cannot affect
      // row a second time" — a 500 for what is really a paste with a duplicate.
      const seen = new Set<string>();
      const values = input
        .filter((g) => {
          if (!g.email) return true;
          const key = g.email.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((g) => ({
          eventId,
          name: g.name,
          email: g.email?.toLowerCase() ?? null,
          phone: g.phone ?? null,
          invitedAt: markInvited ? new Date() : null,
        }));

      const inserted = await db
        .insert(guests)
        .values(values)
        // Re-adding an existing address is a no-op, not an error — hosts paste
        // an updated list over an old one all the time, and wiping an existing
        // guest's RSVP because their name appeared twice would be destructive.
        .onConflictDoNothing()
        .returning();

      return reply.code(201).send({
        added: inserted.length,
        skipped: input.length - inserted.length,
        guests: inserted,
      });
    },
  );

  app.patch(
    "/events/:eventId/guests/:guestId",
    { schema: { params: guestParams, body: guestPatch } },
    async (req, reply) => {
      const { eventId, guestId } = req.params as z.infer<typeof guestParams>;
      const body = req.body as z.infer<typeof guestPatch>;
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const [existing] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });

      const statusChanged = body.rsvpStatus !== undefined && body.rsvpStatus !== existing.rsvpStatus;

      const [updated] = await db
        .update(guests)
        .set({
          ...body,
          email: body.email === undefined ? undefined : body.email?.toLowerCase() ?? null,
          respondedAt: statusChanged && body.rsvpStatus !== "pending" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)))
        .returning();

      if (statusChanged) {
        await db.insert(rsvpLog).values({
          guestId,
          eventId,
          previousStatus: existing.rsvpStatus,
          newStatus: updated.rsvpStatus,
          plusOnes: updated.plusOnes,
        });
      }

      return updated;
    },
  );

  app.delete(
    "/events/:eventId/guests/:guestId",
    { schema: { params: guestParams } },
    async (req, reply) => {
      const { eventId, guestId } = req.params as z.infer<typeof guestParams>;
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const deleted = await db
        .delete(guests)
        .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)))
        .returning({ id: guests.id });

      if (deleted.length === 0) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );

  // Rotates a guest's invite token — the remedy when a personal link is
  // forwarded to a group chat and strangers start RSVPing as that guest.
  app.post(
    "/events/:eventId/guests/:guestId/rotate-token",
    { schema: { params: guestParams } },
    async (req, reply) => {
      const { eventId, guestId } = req.params as z.infer<typeof guestParams>;
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const [updated] = await db
        .update(guests)
        .set({ inviteToken: sql`gen_random_uuid()`, updatedAt: new Date() })
        .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)))
        .returning({ id: guests.id, inviteToken: guests.inviteToken });

      if (!updated) return reply.code(404).send({ error: "not_found" });
      return updated;
    },
  );

  app.get(
    "/events/:eventId/rsvp-log",
    { schema: { params: eventParams } },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const rows = await db
        .select({
          id: rsvpLog.id,
          guestId: rsvpLog.guestId,
          guestName: guests.name,
          previousStatus: rsvpLog.previousStatus,
          newStatus: rsvpLog.newStatus,
          plusOnes: rsvpLog.plusOnes,
          createdAt: rsvpLog.createdAt,
        })
        .from(rsvpLog)
        .leftJoin(guests, eq(guests.id, rsvpLog.guestId))
        .where(eq(rsvpLog.eventId, eventId))
        .orderBy(sql`${rsvpLog.createdAt} desc`)
        .limit(200);

      return { entries: rows };
    },
  );
}
