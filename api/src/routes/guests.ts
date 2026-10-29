import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { guests, rsvpLog } from "../db/schema.js";
import {
  markDelivered,
  recipientsByAddress,
  sendInvitations,
} from "../lib/invitations.js";
import { mailerConfigured } from "../lib/mailer.js";
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
          // Accepted and ignored. It used to stamp invitedAt at insert time,
          // which made the guest list claim people had been written to before
          // anything was sent — and for a draft event, nothing ever was. The
          // column is now set from the send result instead. Kept in the schema
          // so an older client posting it still gets a 200 rather than a
          // validation error.
          markInvited: z.boolean().default(false),
          // Defaults on: a host adding a guest with an email address means to
          // invite them. Set false to build a list quietly and send later.
          sendInvites: z.boolean().default(true),
        }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { guests: input, markInvited, sendInvites } = req.body as {
        guests: z.infer<typeof guestInput>[];
        markInvited: boolean;
        sendInvites: boolean;
      };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

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
          // Never stamped here, whatever `markInvited` says. invitedAt means
          // "mail reached this person", and at insert time nothing has been
          // attempted: the event may be a draft (which sends nothing at all),
          // the guest may have no address, or the send may fail. It is set
          // below, from the send result. See markInvited's own comment.
          invitedAt: null,
        }));

      const inserted = await db
        .insert(guests)
        .values(values)
        // Re-adding an existing address is a no-op, not an error — hosts paste
        // an updated list over an old one all the time, and wiping an existing
        // guest's RSVP because their name appeared twice would be destructive.
        .onConflictDoNothing()
        .returning();

      // Only for a published event. Emailing an invitation whose link 404s is
      // worse than not emailing at all — and unlike the link, an email can't be
      // taken back once it's out.
      //
      // Adding to a DRAFT therefore sends nothing, which used to mean nobody
      // was ever invited: the usual order is create, paste the guest list,
      // then publish, and publishing sent nothing either. Publishing now picks
      // up whoever this skipped — see the publish route.
      const mailed =
        sendInvites && event.status === "published"
          ? await sendInvitations(event, inserted, (m) => req.log.info({ eventId }, m))
          : { delivered: 0, failed: 0, skipped: 0, failedRecipients: [], quotaExhausted: false };

      const failedGuests = recipientsByAddress(inserted, mailed.failedRecipients);
      await markDelivered(eventId, inserted, failedGuests);

      return reply.code(201).send({
        added: inserted.length,
        skipped: input.length - inserted.length,
        emailed: mailed.delivered,
        emailsFailed: mailed.failed + mailed.skipped,
        failedGuests,
        // So the dashboard can say "added, but email isn't set up" rather than
        // implying invitations went out.
        emailConfigured: mailerConfigured(),
        guests: inserted,
      });
    },
  );

  // Sends to guests who have never been reached. NOT a re-send: a guest who
  // already has their invitation never gets another one from here, however
  // long they go without replying.
  //
  // That rule is enforced below rather than left to the caller, because it is
  // a promise to the guest rather than a dashboard preference. One invitation
  // per person, full stop. A host who wants to chase a non-responder has the
  // link, WhatsApp, SMS and the QR code — none of which spend the shared daily
  // mail allowance or put the sending domain's reputation behind a second
  // unsolicited email to someone who did not answer the first.
  app.post(
    "/events/:eventId/guests/send-invitations",
    {
      schema: {
        params: eventParams,
        body: z
          .object({
            // Accepted and ignored. It used to widen the send to guests who had
            // already replied; the uninvited-only rule below supersedes it
            // entirely. Kept so an older client posting it still gets a 200.
            includeResponded: z.boolean().default(false),
            guestIds: z.array(z.string().uuid()).max(500).optional(),
          })
          .default({ includeResponded: false }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      // includeResponded is accepted by the schema and not read here — see the
      // comment on it. Destructuring it would only suggest it still does
      // something.
      const { guestIds } = req.body as { guestIds?: string[] };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      if (event.status !== "published") {
        return reply.code(409).send({ error: "event_not_published" });
      }

      // `invitedAt is null` is the whole rule, and it is the same filter the
      // scheduled job uses — one definition of "still owed an invitation",
      // applied everywhere, rather than each caller deciding for itself.
      //
      // It replaces a filter on RSVP status, which looked similar and was not:
      // "hasn't replied" includes everyone who was invited and stayed quiet,
      // so that path re-mailed people who already had their invitation.
      //
      // Note what this does NOT block. A guest whose send failed never had
      // invitedAt stamped — markDelivered writes it from the send result — so
      // the dashboard's retry for failed recipients still reaches exactly
      // them, which is the one case where a second attempt is a first arrival.
      const conditions = [
        eq(guests.eventId, eventId),
        isNotNull(guests.email),
        isNull(guests.invitedAt),
      ];
      if (guestIds?.length) conditions.push(inArray(guests.id, guestIds));

      const recipients = await db
        .select()
        .from(guests)
        .where(and(...conditions));

      const result = await sendInvitations(event, recipients, (m) =>
        req.log.info({ eventId }, m),
      );

      const failedGuests = recipientsByAddress(recipients, result.failedRecipients);
      await markDelivered(eventId, recipients, failedGuests);

      return {
        recipients: recipients.length,
        delivered: result.delivered,
        failed: result.failed + result.skipped,
        // Named, not just counted, so the dashboard can offer a re-send for
        // exactly these — the expected recovery from a daily quota, not a rare
        // error path.
        failedGuests,
        emailConfigured: mailerConfigured(),
      };
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
