import { and, count, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { signPreviewToken } from "../auth/jwt.js";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { eventTemplates, eventViews, events, guests, type Event } from "../db/schema.js";
import { cardSourceHash as hashCardSource } from "../lib/cardSource.js";
import { toCsv } from "../lib/csv.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { themeOverridesSchema } from "../lib/theme.js";
import { deleteObject, eventIdForKey } from "../plugins/r2.js";

const IANA_ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$|^UTC$/;

// Only http(s). A javascript:/data: URL in any of these fields renders as a
// link on a public page that anyone with the invitation can reach — and, for
// the album, inside an email too.
const httpUrl = z
  .string()
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: "must be an http(s) URL" });

const eventBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  hostDisplayName: z.string().max(120).nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  timezone: z.string().regex(IANA_ZONE, "must be an IANA timezone, e.g. Asia/Kolkata").default("UTC"),
  locationName: z.string().max(200).nullish(),
  locationAddress: z.string().max(500).nullish(),
  locationMapUrl: httpUrl.nullish(),
  coverImageKey: z.string().max(300).nullish(),
  cardImageKey: z.string().max(300).nullish(),
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
  // Google Photos shared album (or any album link) for after the event.
  photoAlbumUrl: httpUrl.nullish(),
});

const eventPatch = eventBody.partial().extend({
  status: z.enum(["draft", "published", "cancelled", "archived"]).optional(),
});

// Rejects an image key the caller doesn't own. Keys are minted by
// /storage/presign-upload, but nothing stops a client sending an arbitrary
// string here, and an unchecked key would let one host point at another
// event's object.
function keyBelongsToEvent(key: string | null | undefined, eventId: string): boolean {
  if (!key) return true;
  return eventIdForKey(key) === eventId;
}

/**
 * Whether the saved card image no longer matches the event it depicts.
 *
 * An event with no card is never stale — there is nothing to be wrong. Nor is
 * one whose hash is null: that is a card exported before this column existed,
 * and warning a host about a card that may well be fine is worse than staying
 * quiet until their next save fills the hash in.
 */
function isCardStale(event: Event): boolean {
  if (!event.cardImageKey || !event.cardSourceHash) return false;
  return event.cardSourceHash !== hashCardSource(event);
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
          // Responses the host hasn't looked at yet. A guest CHANGING their
          // answer counts as new, because responded_at moves — which is
          // correct: "Meera switched to declined" is exactly what a host needs
          // to notice.
          newResponses: sql<number>`count(*) filter (where ${guests.respondedAt} is not null and (${events.responsesSeenAt} is null or ${guests.respondedAt} > ${events.responsesSeenAt}))::int`,
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

      // Built in TS rather than interpolated into SQL: responsesSeenAt is
      // already a JS value here, and a null one means "never looked", so the
      // comparison simply drops out of the predicate.
      const seen = event.responsesSeenAt;
      const [tally] = await db
        .select({ newResponses: count() })
        .from(guests)
        .where(
          and(
            eq(guests.eventId, eventId),
            isNotNull(guests.respondedAt),
            ...(seen ? [gt(guests.respondedAt, seen)] : []),
          ),
        );

      // responsesSeenAt is returned alongside so the client can mark which
      // individual rows are new BEFORE calling /responses-seen to clear it.
      return {
        ...event,
        newResponses: tally?.newResponses ?? 0,
        cardStale: isCardStale(event),
      };
    },
  );

  // Marks the responses as read. Separate from GET on purpose: a read
  // shouldn't have a side effect, and the client needs the "before" state to
  // render what's new in the same paint.
  app.post(
    "/events/:eventId/responses-seen",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;

      const [updated] = await db
        .update(events)
        .set({ responsesSeenAt: new Date() })
        .where(and(eq(events.id, eventId), eq(events.hostId, req.userId!)))
        .returning({ responsesSeenAt: events.responsesSeenAt });

      return { responsesSeenAt: updated.responsesSeenAt };
    },
  );

  // Mints a link that shows a draft invitation exactly as a guest will see it.
  //
  // A draft has no other way to be looked at: /e/:slug serves published events
  // only, and the dashboard's summary is not the invitation. Publishing to
  // check the design and unpublishing afterwards is the workaround this
  // removes — and it is a bad one, because the link is usually already out.
  //
  // The token is scoped to this event and expires in two hours, so it is a
  // thing you click now, not a second, quieter way to share an invitation.
  app.post(
    "/events/:eventId/preview-link",
    { schema: { params: z.object({ eventId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId } = req.params as { eventId: string };
      const event = await loadOwnedEvent(eventId, req.userId!, reply);
      if (!event) return;

      return {
        url: `${env.WEB_ORIGIN}/e/${event.slug}?p=${signPreviewToken(event.id)}`,
        expiresInSeconds: 2 * 60 * 60,
      };
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

      if (!keyBelongsToEvent(body.coverImageKey, eventId)) {
        return reply.code(400).send({ error: "invalid_cover_image_key" });
      }
      if (!keyBelongsToEvent(body.cardImageKey, eventId)) {
        return reply.code(400).send({ error: "invalid_card_image_key" });
      }

      // Cross-field check the DB constraint can't do on a partial update: the
      // CHECK sees the merged row, but a clear error beats a 500 from a
      // constraint violation.
      const startsAt = body.startsAt ?? existing.startsAt;
      const endsAt = body.endsAt === undefined ? existing.endsAt : body.endsAt;
      if (endsAt && endsAt < startsAt) {
        return reply.code(400).send({ error: "ends_before_starts" });
      }

      // The fingerprint is written in the same statement as the key, from the
      // row as it will be *after* this update — the designer sends the design
      // and the image in one PATCH, so hashing `existing` would record the
      // state the card was drawn from one save too late and report every fresh
      // card as stale.
      const cardSourceHash =
        body.cardImageKey !== undefined && body.cardImageKey !== null
          ? hashCardSource({ ...existing, ...body })
          : undefined;

      const [updated] = await db
        .update(events)
        .set({ ...body, cardSourceHash, updatedAt: new Date() })
        .where(and(eq(events.id, eventId), eq(events.hostId, req.userId!)))
        .returning();

      // Replacing an image leaves the old object orphaned in R2 otherwise, and
      // the card is re-exported every time the host nudges the design — one
      // orphan per save adds up fast. Best-effort: a failed delete must not
      // fail the update.
      for (const [field, previous] of [
        ["coverImageKey", existing.coverImageKey],
        ["cardImageKey", existing.cardImageKey],
      ] as const) {
        const next = body[field];
        if (next !== undefined && previous && previous !== next) {
          deleteObject(previous).catch((err) =>
            req.log.warn({ err, key: previous }, `orphaned ${field} object not deleted`),
          );
        }
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

      for (const key of [event.coverImageKey, event.cardImageKey]) {
        if (!key) continue;
        deleteObject(key).catch((err) =>
          req.log.warn({ err, key }, "image not deleted for removed event"),
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
          "Bringing",
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
          // Joined into one cell rather than N columns — the width would be set
          // by whichever guest brings the most people, leaving the sheet mostly
          // empty for everyone else.
          g.plusOneNames?.join("; ") ?? "",
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
