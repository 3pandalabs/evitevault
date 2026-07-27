import { and, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { eventTemplates, eventViews, events, guests } from "../db/schema.js";
import { toCsv } from "../lib/csv.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { themeOverridesSchema } from "../lib/theme.js";
import { deleteObject, eventIdForKey } from "../plugins/r2.js";

const IANA_ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$|^UTC$/;

const eventBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  hostDisplayName: z.string().max(120).nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  timezone: z.string().regex(IANA_ZONE, "must be an IANA timezone, e.g. Asia/Kolkata").default("UTC"),
  locationName: z.string().max(200).nullish(),
  locationAddress: z.string().max(500).nullish(),
  // Only http(s). A javascript:/data: URL here renders as a link on a public
  // page that anyone with the invitation can reach.
  locationMapUrl: z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), {
    message: "must be an http(s) URL",
  }).nullish(),
  coverImageKey: z.string().max(300).nullish(),
  templateId: z.string().uuid().nullish(),
  themeOverrides: themeOverridesSchema.nullish(),
  rsvpDeadline: z.coerce.date().nullish(),
  allowPlusOnes: z.boolean().default(true),
  maxPlusOnes: z.number().int().min(0).max(20).default(2),
  capacity: z.number().int().positive().max(100_000).nullish(),
  collectDietary: z.boolean().default(false),
  allowPublicRsvp: z.boolean().default(true),
  guestbookEnabled: z.boolean().default(true),
  guestPhotosEnabled: z.boolean().default(true),
  showGuestList: z.boolean().default(false),
});

const eventPatch = eventBody.partial().extend({
  status: z.enum(["draft", "published", "cancelled", "archived"]).optional(),
});

// Rejects a cover image key the caller doesn't own. Keys are minted by
// /storage/presign-upload, but nothing stops a client sending an arbitrary
// string here, and an unchecked key would let one host point at another
// event's object.
function coverKeyBelongsToEvent(key: string | null | undefined, eventId: string): boolean {
  if (!key) return true;
  return eventIdForKey(key) === eventId;
}

export async function eventRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // --- list -----------------------------------------------------------------
  app.get(
    "/events",
    { schema: { querystring: z.object({ status: z.enum(["draft", "published", "cancelled", "archived"]).optional() }) } },
    async (req) => {
      const { status } = req.query as { status?: string };

      // RSVP tallies come back with the list so the dashboard renders in one
      // round trip instead of N+1 requests per event card.
      const rows = await db
        .select({
          id: events.id,
          slug: events.slug,
          title: events.title,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          timezone: events.timezone,
          locationName: events.locationName,
          coverImageKey: events.coverImageKey,
          status: events.status,
          capacity: events.capacity,
          createdAt: events.createdAt,
          invited: sql<number>`count(${guests.id})::int`,
          attending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'attending')::int`,
          declined: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'declined')::int`,
          maybe: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'maybe')::int`,
          pending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'pending')::int`,
          headcount: sql<number>`coalesce(sum(1 + ${guests.plusOnes}) filter (where ${guests.rsvpStatus} = 'attending'), 0)::int`,
        })
        .from(events)
        .leftJoin(guests, eq(guests.eventId, events.id))
        .where(
          status
            ? and(eq(events.hostId, req.userId!), eq(events.status, status))
            : eq(events.hostId, req.userId!),
        )
        .groupBy(events.id)
        .orderBy(desc(events.startsAt));

      return { events: rows };
    },
  );

  // --- create ---------------------------------------------------------------
  app.post("/events", { schema: { body: eventBody } }, async (req, reply) => {
    const body = req.body as z.infer<typeof eventBody>;

    if (body.templateId) {
      const [tpl] = await db
        .select({ id: eventTemplates.id })
        .from(eventTemplates)
        .where(eq(eventTemplates.id, body.templateId))
        .limit(1);
      if (!tpl) return reply.code(400).send({ error: "unknown_template" });
    }

    // Cover art can't be validated against the event id here — the event
    // doesn't exist yet, so its key can't have been minted. Clients upload the
    // cover after creation via PATCH.
    const [created] = await db
      .insert(events)
      .values({ ...body, coverImageKey: null, hostId: req.userId! })
      .returning();

    return reply.code(201).send(created);
  });

  // --- read -----------------------------------------------------------------
  app.get(
    "/events/:eventId",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;
      return event;
    },
  );

  // --- update ---------------------------------------------------------------
  app.patch(
    "/events/:eventId",
    { schema: { params: z.object({ eventId: z.string().uuid() }), body: eventPatch } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const body = req.body as z.infer<typeof eventPatch>;
      const existing = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!existing) return;

      if (!coverKeyBelongsToEvent(body.coverImageKey, eventId)) {
        return reply.code(400).send({ error: "invalid_cover_image_key" });
      }

      // Cross-field check the DB constraint can't do on a partial update: the
      // CHECK sees the merged row, but a clear error beats a 500 from a
      // constraint violation.
      const startsAt = body.startsAt ?? existing.startsAt;
      const endsAt = body.endsAt === undefined ? existing.endsAt : body.endsAt;
      if (endsAt && endsAt < startsAt) {
        return reply.code(400).send({ error: "ends_before_starts" });
      }

      const [updated] = await db
        .update(events)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(events.id, eventId), eq(events.hostId, req.userId!)))
        .returning();

      // Replacing the cover leaves the old object orphaned in R2 otherwise.
      // Best-effort: a failed delete must not fail the update.
      if (
        body.coverImageKey !== undefined &&
        existing.coverImageKey &&
        existing.coverImageKey !== body.coverImageKey
      ) {
        deleteObject(existing.coverImageKey).catch((err) =>
          req.log.warn({ err, key: existing.coverImageKey }, "orphaned cover image not deleted"),
        );
      }

      return updated;
    },
  );

  // --- publish / unpublish --------------------------------------------------
  app.post(
    "/events/:eventId/publish",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      // A published invitation with no date renders a blank hero and can't
      // produce a valid .ics, so the check is here rather than at create time
      // where a half-filled draft is legitimate.
      if (!event.title.trim() || !event.startsAt) {
        return reply.code(400).send({ error: "incomplete_event" });
      }

      const [updated] = await db
        .update(events)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();
      return updated;
    },
  );

  // --- delete ---------------------------------------------------------------
  app.delete(
    "/events/:eventId",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      // Guests, guestbook posts, announcements and views all cascade in the DB.
      await db.delete(events).where(eq(events.id, eventId));

      if (event.coverImageKey) {
        deleteObject(event.coverImageKey).catch((err) =>
          req.log.warn({ err }, "cover image not deleted for removed event"),
        );
      }
      return reply.code(204).send();
    },
  );

  // --- analytics ------------------------------------------------------------
  app.get(
    "/events/:eventId/analytics",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      const [tally] = await db
        .select({
          invited: count(),
          attending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'attending')::int`,
          declined: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'declined')::int`,
          maybe: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'maybe')::int`,
          pending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'pending')::int`,
          headcount: sql<number>`coalesce(sum(1 + ${guests.plusOnes}) filter (where ${guests.rsvpStatus} = 'attending'), 0)::int`,
          opened: sql<number>`count(*) filter (where ${guests.firstViewedAt} is not null)::int`,
        })
        .from(guests)
        .where(eq(guests.eventId, eventId));

      const [views] = await db
        .select({
          total: count(),
          uniqueVisitors: sql<number>`count(distinct ${eventViews.visitorHash})::int`,
        })
        .from(eventViews)
        .where(eq(eventViews.eventId, eventId));

      const byDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${eventViews.viewedAt}), 'YYYY-MM-DD')`,
          views: count(),
        })
        .from(eventViews)
        .where(eq(eventViews.eventId, eventId))
        .groupBy(sql`date_trunc('day', ${eventViews.viewedAt})`)
        .orderBy(sql`date_trunc('day', ${eventViews.viewedAt})`);

      const responded = tally.attending + tally.declined + tally.maybe;
      return {
        rsvp: tally,
        views: { total: views?.total ?? 0, uniqueVisitors: views?.uniqueVisitors ?? 0, byDay },
        // Guarded: an event with no guests yet would otherwise return NaN and
        // render as "NaN%" on the dashboard.
        responseRate: tally.invited > 0 ? Number((responded / tally.invited).toFixed(4)) : 0,
      };
    },
  );

  // --- CSV export -----------------------------------------------------------
  app.get(
    "/events/:eventId/guests.csv",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      const rows = await db
        .select()
        .from(guests)
        .where(eq(guests.eventId, eventId))
        .orderBy(guests.name);

      const csv = toCsv(
        [
          "Name",
          "Email",
          "Phone",
          "RSVP",
          "Plus ones",
          "Total headcount",
          "Dietary notes",
          "Message",
          "Source",
          "Invited at",
          "First viewed at",
          "Responded at",
        ],
        rows.map((g) => [
          g.name,
          g.email,
          g.phone,
          g.rsvpStatus,
          g.plusOnes,
          g.rsvpStatus === "attending" ? 1 + g.plusOnes : 0,
          g.dietaryNotes,
          g.message,
          g.source,
          g.invitedAt,
          g.firstViewedAt,
          g.respondedAt,
        ]),
      );

      // Slug, not title, in the filename — a title can contain quotes, slashes
      // or newlines, all of which break the Content-Disposition header.
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="guests-${event.slug}.csv"`)
        .send(csv);
    },
  );
}
