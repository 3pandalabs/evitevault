import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  eventTemplates,
  eventViews,
  events,
  guestbookPosts,
  guests,
  rsvpLog,
  users,
  type Event,
  type Guest,
} from "../db/schema.js";
import { currentHour, visitorHash } from "../lib/analytics.js";
import { buildIcs, googleCalendarUrl } from "../lib/ics.js";
import { resolveTheme } from "../lib/theme.js";
import { env } from "../env.js";
import {
  extForType,
  guestbookImageKey,
  isAllowedImageType,
  presignDownload,
  presignUpload,
} from "../plugins/r2.js";

// ---------------------------------------------------------------------------
// EVERY route in this file is anonymous. The only credentials are the event
// slug (unguessable, in the URL) and an optional per-guest invite token.
//
// Rules, all of which have a matching note in CLAUDE.md:
//   1. Look events up by slug, never by id, and only where status='published'.
//   2. Never emit a host's email, another guest's contact details, or any
//      invite token other than the one the caller already presented.
//   3. Shape every response through toPublicEvent() — no ad-hoc serialisation.
// ---------------------------------------------------------------------------

const slugParams = z.object({ slug: z.string().min(12).max(200) });
const tokenQuery = z.object({ t: z.string().uuid().optional() });

type EventWithTemplate = { event: Event; templateTheme: unknown; hostName: string | null };

async function loadPublishedEvent(slug: string): Promise<EventWithTemplate | null> {
  const [row] = await db
    .select({
      event: events,
      templateTheme: eventTemplates.theme,
      hostName: users.displayName,
    })
    .from(events)
    .leftJoin(eventTemplates, eq(eventTemplates.id, events.templateId))
    .leftJoin(users, eq(users.id, events.hostId))
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .limit(1);

  return row ?? null;
}

// A cancelled or draft event is indistinguishable from a nonexistent one, so a
// harvested slug can't confirm an event ever existed.
async function loadGuestByToken(eventId: string, token: string | undefined): Promise<Guest | null> {
  if (!token) return null;
  const [g] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.eventId, eventId), eq(guests.inviteToken, token)))
    .limit(1);
  return g ?? null;
}

async function toPublicEvent(row: EventWithTemplate, guest: Guest | null) {
  const { event } = row;

  const [tally] = await db
    .select({
      attending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'attending')::int`,
      headcount: sql<number>`coalesce(sum(1 + ${guests.plusOnes}) filter (where ${guests.rsvpStatus} = 'attending'), 0)::int`,
    })
    .from(guests)
    .where(eq(guests.eventId, event.id));

  // The attendee list is opt-in per event and carries first names only — a
  // full guest list with surnames on a link-shareable page is a privacy leak
  // the host almost never intends.
  const attendees = event.showGuestList
    ? (
        await db
          .select({ name: guests.name, plusOnes: guests.plusOnes })
          .from(guests)
          .where(and(eq(guests.eventId, event.id), eq(guests.rsvpStatus, "attending")))
          .orderBy(guests.name)
          .limit(300)
      ).map((g) => ({ name: g.name.split(" ")[0], plusOnes: g.plusOnes }))
    : null;

  const rsvpClosed =
    event.rsvpDeadline !== null && event.rsvpDeadline.getTime() < Date.now();
  const atCapacity =
    event.capacity !== null && (tally?.headcount ?? 0) >= event.capacity;

  const invitationUrl = `${env.WEB_ORIGIN}/e/${event.slug}`;
  const icsInput = { ...event, url: invitationUrl, organizerName: event.hostDisplayName ?? row.hostName };

  return {
    slug: event.slug,
    title: event.title,
    description: event.description,
    hostName: event.hostDisplayName ?? row.hostName,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    location: {
      name: event.locationName,
      address: event.locationAddress,
      mapUrl: event.locationMapUrl,
    },
    coverImageUrl: event.coverImageKey ? await presignDownload(event.coverImageKey) : null,
    theme: resolveTheme(row.templateTheme, event.themeOverrides),
    rsvp: {
      deadline: event.rsvpDeadline,
      closed: rsvpClosed,
      atCapacity,
      allowPlusOnes: event.allowPlusOnes,
      maxPlusOnes: event.maxPlusOnes,
      collectDietary: event.collectDietary,
      // An open event lets a stranger holding the link respond; otherwise a
      // valid invite token is the only way in.
      canRespond: !rsvpClosed && (event.allowPublicRsvp || guest !== null),
      requiresToken: !event.allowPublicRsvp,
    },
    guestbook: {
      enabled: event.guestbookEnabled,
      photosEnabled: event.guestPhotosEnabled,
    },
    attending: { count: tally?.attending ?? 0, headcount: tally?.headcount ?? 0, attendees },
    calendar: {
      icsUrl: `${invitationUrl}/calendar.ics`,
      googleUrl: googleCalendarUrl(icsInput),
    },
    // Only ever the caller's own guest record, only when they presented its
    // token. Contact details are echoed back because the guest supplied them.
    you: guest
      ? {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          rsvpStatus: guest.rsvpStatus,
          plusOnes: guest.plusOnes,
          dietaryNotes: guest.dietaryNotes,
          message: guest.message,
          respondedAt: guest.respondedAt,
        }
      : null,
  };
}

// Fire-and-forget so a slow analytics write never delays the invitation
// render. Deduped to one row per visitor per hour by uq_event_views_hourly.
function recordView(req: FastifyRequest, eventId: string, guestId: string | null) {
  const now = new Date();
  db.insert(eventViews)
    .values({
      eventId,
      guestId,
      visitorHash: visitorHash(req),
      viewedAt: now,
      viewedHour: currentHour(now),
    })
    .onConflictDoNothing()
    .catch((err) => req.log.warn({ err }, "event view not recorded"));
}

export async function publicEventRoutes(app: FastifyInstance) {
  // --- the invitation -------------------------------------------------------
  app.get(
    "/public/events/:slug",
    { schema: { params: slugParams, querystring: tokenQuery } },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const { t } = req.query as z.infer<typeof tokenQuery>;

      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });

      const guest = await loadGuestByToken(row.event.id, t);

      recordView(req, row.event.id, guest?.id ?? null);
      if (guest) {
        const now = new Date();
        db.update(guests)
          .set({ firstViewedAt: guest.firstViewedAt ?? now, lastViewedAt: now })
          .where(eq(guests.id, guest.id))
          .catch((err) => req.log.warn({ err }, "guest view timestamps not updated"));
      }

      return toPublicEvent(row, guest);
    },
  );

  // --- RSVP -----------------------------------------------------------------
  app.post(
    "/public/events/:slug/rsvp",
    {
      schema: {
        params: slugParams,
        body: z.object({
          token: z.string().uuid().optional(),
          // Required only on the open-RSVP path, checked below rather than in
          // the schema so the error is specific.
          name: z.string().min(1).max(200).optional(),
          email: z.string().email().max(320).nullish(),
          status: z.enum(["attending", "declined", "maybe"]),
          plusOnes: z.number().int().min(0).max(20).default(0),
          dietaryNotes: z.string().max(1000).nullish(),
          message: z.string().max(2000).nullish(),
        }),
      },
    },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const body = req.body as {
        token?: string;
        name?: string;
        email?: string | null;
        status: "attending" | "declined" | "maybe";
        plusOnes: number;
        dietaryNotes?: string | null;
        message?: string | null;
      };

      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });
      const event = row.event;

      if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
        return reply.code(409).send({ error: "rsvp_closed" });
      }

      const plusOnes = event.allowPlusOnes ? Math.min(body.plusOnes, event.maxPlusOnes) : 0;
      const guest = await loadGuestByToken(event.id, body.token);

      if (!guest && !event.allowPublicRsvp) {
        // No token and the event isn't open: refuse rather than silently
        // creating a guest, which would let anyone with the slug pad the list.
        return reply.code(403).send({ error: "invitation_required" });
      }

      // Capacity is checked before the write and again by nothing else — two
      // simultaneous RSVPs can both pass here and overshoot by one. That is
      // deliberate: a hard DB-level cap would need a serialisable transaction
      // per RSVP, and a host would rather have 51 guests than a stranger's
      // browser showing an error at the moment they say yes. The dashboard
      // shows the overage.
      if (body.status === "attending" && event.capacity !== null) {
        const [tally] = await db
          .select({
            headcount: sql<number>`coalesce(sum(1 + ${guests.plusOnes}) filter (where ${guests.rsvpStatus} = 'attending'), 0)::int`,
          })
          .from(guests)
          .where(eq(guests.eventId, event.id));
        const alreadyCounted = guest?.rsvpStatus === "attending" ? 1 + guest.plusOnes : 0;
        if ((tally?.headcount ?? 0) - alreadyCounted + 1 + plusOnes > event.capacity) {
          return reply.code(409).send({ error: "at_capacity" });
        }
      }

      const now = new Date();

      if (guest) {
        const [updated] = await db
          .update(guests)
          .set({
            rsvpStatus: body.status,
            plusOnes,
            dietaryNotes: event.collectDietary ? body.dietaryNotes ?? null : null,
            message: body.message ?? null,
            // The guest may correct the name on their own invitation, but not
            // their email — changing it could collide with another invitee's
            // row and is not something an RSVP form needs to do.
            name: body.name?.trim() || guest.name,
            respondedAt: now,
            updatedAt: now,
          })
          .where(eq(guests.id, guest.id))
          .returning();

        await db.insert(rsvpLog).values(rsvpLogValues(updated.id, event.id, guest.rsvpStatus, updated));
        return { ok: true, status: updated.rsvpStatus, plusOnes: updated.plusOnes };
      }

      // Open RSVP: a brand-new guest row.
      if (!body.name?.trim()) {
        return reply.code(400).send({ error: "name_required" });
      }

      const email = body.email?.toLowerCase() ?? null;

      // If the address already exists on this event, the caller is someone who
      // was invited but is using the generic link. Do NOT overwrite that row —
      // that would let anyone who guesses an invitee's email change their
      // response. Point them at their own invitation instead.
      if (email) {
        const [clash] = await db
          .select({ id: guests.id })
          .from(guests)
          .where(and(eq(guests.eventId, event.id), sql`lower(${guests.email}) = ${email}`))
          .limit(1);
        if (clash) {
          return reply.code(409).send({ error: "already_invited" });
        }
      }

      const [created] = await db
        .insert(guests)
        .values({
          eventId: event.id,
          name: body.name.trim(),
          email,
          rsvpStatus: body.status,
          plusOnes,
          dietaryNotes: event.collectDietary ? body.dietaryNotes ?? null : null,
          message: body.message ?? null,
          source: "public",
          respondedAt: now,
        })
        .returning();

      await db.insert(rsvpLog).values(rsvpLogValues(created.id, event.id, null, created));

      // The new guest gets their own token back so they can return and amend
      // their answer — it is the only way an open-RSVP responder can edit.
      return reply.code(201).send({
        ok: true,
        status: created.rsvpStatus,
        plusOnes: created.plusOnes,
        inviteToken: created.inviteToken,
      });
    },
  );

  // --- calendar -------------------------------------------------------------
  app.get(
    "/public/events/:slug/calendar.ics",
    { schema: { params: slugParams } },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });

      const ics = buildIcs({
        ...row.event,
        url: `${env.WEB_ORIGIN}/e/${row.event.slug}`,
        organizerName: row.event.hostDisplayName ?? row.hostName,
      });

      return reply
        .header("content-type", "text/calendar; charset=utf-8")
        .header("content-disposition", `attachment; filename="${row.event.slug}.ics"`)
        .send(ics);
    },
  );

  // --- guestbook ------------------------------------------------------------
  app.get(
    "/public/events/:slug/guestbook",
    { schema: { params: slugParams } },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });
      if (!row.event.guestbookEnabled) return { posts: [] };

      const rows = await db
        .select({
          id: guestbookPosts.id,
          authorName: guestbookPosts.authorName,
          body: guestbookPosts.body,
          imageKey: guestbookPosts.imageKey,
          createdAt: guestbookPosts.createdAt,
        })
        .from(guestbookPosts)
        .where(and(eq(guestbookPosts.eventId, row.event.id), eq(guestbookPosts.status, "visible")))
        .orderBy(desc(guestbookPosts.createdAt))
        .limit(200);

      return {
        posts: await Promise.all(
          rows.map(async ({ imageKey, ...p }) => ({
            ...p,
            imageUrl: imageKey ? await presignDownload(imageKey) : null,
          })),
        ),
      };
    },
  );

  app.post(
    "/public/events/:slug/guestbook",
    {
      schema: {
        params: slugParams,
        body: z.object({
          token: z.string().uuid().optional(),
          authorName: z.string().min(1).max(120).optional(),
          body: z.string().max(2000).nullish(),
          imageKey: z.string().max(300).nullish(),
        }),
      },
    },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const body = req.body as {
        token?: string;
        authorName?: string;
        body?: string | null;
        imageKey?: string | null;
      };

      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });
      if (!row.event.guestbookEnabled) return reply.code(403).send({ error: "guestbook_disabled" });

      const guest = await loadGuestByToken(row.event.id, body.token);
      const authorName = guest?.name ?? body.authorName?.trim();
      if (!authorName) return reply.code(400).send({ error: "author_name_required" });

      if (!body.body?.trim() && !body.imageKey) {
        return reply.code(400).send({ error: "empty_post" });
      }
      if (body.imageKey && !row.event.guestPhotosEnabled) {
        return reply.code(403).send({ error: "photos_disabled" });
      }
      // The key must be one this API minted for this event's guestbook prefix.
      // Without this a caller could attach any object in the bucket to their
      // post and have the API presign a read of it for everyone.
      if (body.imageKey && !body.imageKey.startsWith(`events/${row.event.id}/guestbook/`)) {
        return reply.code(400).send({ error: "invalid_image_key" });
      }

      const [created] = await db
        .insert(guestbookPosts)
        .values({
          eventId: row.event.id,
          guestId: guest?.id ?? null,
          authorName,
          body: body.body?.trim() || null,
          imageKey: body.imageKey ?? null,
        })
        .returning({
          id: guestbookPosts.id,
          authorName: guestbookPosts.authorName,
          body: guestbookPosts.body,
          createdAt: guestbookPosts.createdAt,
        });

      return reply.code(201).send(created);
    },
  );

  // Presigned upload for a guest photo. Gated on the event allowing photos, so
  // an anonymous caller can't use a published invitation as free object
  // storage; the key is server-generated and scoped to the event's prefix.
  app.post(
    "/public/events/:slug/guestbook/presign-upload",
    {
      schema: {
        params: slugParams,
        body: z.object({ contentType: z.string().max(100) }),
      },
    },
    async (req, reply) => {
      const { slug } = req.params as z.infer<typeof slugParams>;
      const { contentType } = req.body as { contentType: string };

      const row = await loadPublishedEvent(slug);
      if (!row) return reply.code(404).send({ error: "not_found" });
      if (!row.event.guestbookEnabled || !row.event.guestPhotosEnabled) {
        return reply.code(403).send({ error: "photos_disabled" });
      }
      if (!isAllowedImageType(contentType)) {
        return reply.code(400).send({ error: "unsupported_content_type" });
      }

      const key = guestbookImageKey(row.event.id, extForType(contentType));
      return { key, uploadUrl: await presignUpload(key, contentType) };
    },
  );
}

// Small helper so the two RSVP paths can't drift on what gets logged.
function rsvpLogValues(
  guestId: string,
  eventId: string,
  previousStatus: string | null,
  updated: Guest,
) {
  return {
    guestId,
    eventId,
    previousStatus,
    newStatus: updated.rsvpStatus,
    plusOnes: updated.plusOnes,
  };
}
