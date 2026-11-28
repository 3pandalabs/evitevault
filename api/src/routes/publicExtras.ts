import { and, asc, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  albumPhotos,
  datePollOptions,
  datePollVotes,
  eventCohosts,
  events,
  guests,
  potluckClaims,
  potluckItems,
  type Event,
  type Guest,
} from "../db/schema.js";
import { albumVisible, ALBUM_MAX_BYTES, ALBUM_MAX_PHOTOS, canRemovePhoto, isAlbumKeyFor, uploadProblem } from "../lib/features/album.js";
import { publicCohostNames } from "../lib/features/cohosts.js";
import { chipInLinks, playlistService, publicRegistry } from "../lib/features/links.js";
import { claimProblem, claimerLabel, remaining } from "../lib/features/potluck.js";
import { tallyPoll } from "../lib/features/poll.js";
import { parseQuestions } from "../lib/features/questions.js";
import { rateLimiter } from "../lib/rateLimit.js";
import { clientIp } from "../lib/analytics.js";
import {
  albumImageKey,
  deleteObject,
  extForType,
  headObject,
  isAllowedImageType,
  presignDownload,
  presignUploadSized,
} from "../plugins/r2.js";

// Guest-side routes for the free host features (migration 0015). Same rules as
// routes/publicEvents.ts, which this file extends rather than duplicates:
//   1. Look events up by slug only, published only.
//   2. Never emit another guest's email, phone or token. Names on public lists
//      are FIRST names only (potluck claimers, poll voters are counts only).
//   3. `publicExtras()` is the only shape these features add to the public
//      invitation; toPublicEvent() spreads it in as `extras`.
// Every write needs the guest's own invite token: an anonymous visitor can
// look, but only an invited (or already-replied) guest can claim, vote or
// upload.

const slugParams = z.object({ slug: z.string().min(12).max(200) });

async function loadPublished(slug: string): Promise<Event | null> {
  const [e] = await db.select().from(events).where(and(eq(events.slug, slug), eq(events.status, "published"))).limit(1);
  return e ?? null;
}

async function guestByToken(eventId: string, token: string | undefined | null): Promise<Guest | null> {
  if (!token) return null;
  const [g] = await db.select().from(guests).where(and(eq(guests.eventId, eventId), eq(guests.inviteToken, token))).limit(1);
  return g ?? null;
}

async function publicPotluck(event: Event, guest: Guest | null) {
  if (!event.potluckEnabled) return null;
  const items = await db.select().from(potluckItems).where(eq(potluckItems.eventId, event.id)).orderBy(asc(potluckItems.sortOrder), asc(potluckItems.createdAt));
  const claims = await db
    .select({ itemId: potluckClaims.itemId, quantity: potluckClaims.quantity, guestId: potluckClaims.guestId, name: guests.name })
    .from(potluckClaims)
    .innerJoin(guests, eq(guests.id, potluckClaims.guestId))
    .where(eq(potluckClaims.eventId, event.id));
  return {
    items: items.map((i) => {
      const cs = claims.filter((c) => c.itemId === i.id);
      const claimed = cs.reduce((s, c) => s + c.quantity, 0);
      return {
        id: i.id,
        name: i.name,
        note: i.note,
        quantity: i.quantity,
        remaining: remaining(i.quantity, claimed),
        claimedBy: cs.map((c) => ({ name: claimerLabel(c.name), quantity: c.quantity })),
        mine: guest ? (cs.find((c) => c.guestId === guest.id)?.quantity ?? 0) : 0,
      };
    }),
  };
}

async function publicPoll(event: Event, guest: Guest | null) {
  if (event.datePollStatus !== "open") return null;
  const options = await db.select().from(datePollOptions).where(eq(datePollOptions.eventId, event.id)).orderBy(asc(datePollOptions.startsAt));
  const votes = await db.select({ optionId: datePollVotes.optionId, answer: datePollVotes.answer, guestId: datePollVotes.guestId }).from(datePollVotes).where(eq(datePollVotes.eventId, event.id));
  const tallies = tallyPoll(options, votes);
  return {
    options: options.map((o) => {
      const t = tallies.find((x) => x.optionId === o.id)!;
      return { id: o.id, startsAt: o.startsAt, endsAt: o.endsAt, yes: t.yes, maybe: t.maybe, no: t.no, mine: guest ? (votes.find((v) => v.optionId === o.id && v.guestId === guest.id)?.answer ?? null) : null };
    }),
    canVote: guest !== null,
  };
}

/** What the free host features add to the public invitation (spread into toPublicEvent as `extras`). */
export async function publicExtras(event: Event, guest: Guest | null) {
  const cohosts = await db.select({ name: eventCohosts.name, status: eventCohosts.status }).from(eventCohosts).where(eq(eventCohosts.eventId, event.id));
  const [{ n: albumCount }] = event.albumEnabled
    ? await db.select({ n: count() }).from(albumPhotos).where(eq(albumPhotos.eventId, event.id))
    : [{ n: 0 }];
  return {
    cohostNames: publicCohostNames(cohosts),
    registry: publicRegistry(event.registryLinks ?? null),
    playlist: event.playlistUrl ? { url: event.playlistUrl, service: playlistService(event.playlistUrl) } : null,
    // The host's own payment handles; we never handle the money.
    chipIn: chipInLinks(event.chipIn ?? null),
    questions: parseQuestions(event.rsvpQuestions),
    approvalRequired: event.approvalRequired,
    waitlistEnabled: event.waitlistEnabled,
    potluck: await publicPotluck(event, guest),
    poll: await publicPoll(event, guest),
    album: albumVisible(event)
      ? { count: albumCount, max: ALBUM_MAX_PHOTOS, maxBytes: ALBUM_MAX_BYTES, guestUploads: event.albumGuestUploads, canUpload: event.albumGuestUploads && guest !== null }
      : null,
    // Only the caller's own record, only with their own token.
    mine: guest ? { answers: guest.answers ?? {}, waitlistReason: guest.waitlistReason, approvalStatus: guest.approvalStatus } : null,
  };
}

// Anonymous writes are limited per IP (a burst of uploads or claims from one
// address is abuse, not a party).
const writesPerIp = rateLimiter(120, 60 * 60_000);

export async function publicExtrasRoutes(app: FastifyInstance) {
  // --- potluck claim ----------------------------------------------------------
  app.post(
    "/public/events/:slug/potluck/:itemId/claim",
    {
      schema: {
        params: slugParams.extend({ itemId: z.string().uuid() }),
        body: z.object({ token: z.string().uuid(), quantity: z.number().int().min(0).max(100) }),
      },
    },
    async (req, reply) => {
      const { slug, itemId } = req.params as { slug: string; itemId: string };
      const { token, quantity } = req.body as { token: string; quantity: number };
      if (!writesPerIp(clientIp(req))) return reply.code(429).send({ error: "too_many_requests" });
      const event = await loadPublished(slug);
      if (!event || !event.potluckEnabled) return reply.code(404).send({ error: "not_found" });
      const guest = await guestByToken(event.id, token);
      if (!guest) return reply.code(403).send({ error: "invitation_required" });

      // Locked per item so two guests cannot both take the last one.
      const result = await db.transaction(async (tx) => {
        const [item] = await tx.select().from(potluckItems).where(and(eq(potluckItems.id, itemId), eq(potluckItems.eventId, event.id))).for("update").limit(1);
        if (!item) return { error: "not_found" as const, code: 404 };
        const cs = await tx.select({ guestId: potluckClaims.guestId, quantity: potluckClaims.quantity }).from(potluckClaims).where(eq(potluckClaims.itemId, itemId));
        const total = cs.reduce((s, c) => s + c.quantity, 0);
        const mine = cs.find((c) => c.guestId === guest.id)?.quantity ?? 0;
        const problem = claimProblem({ itemQuantity: item.quantity, totalClaimed: total, mine, wanted: quantity });
        if (problem) return { error: problem, code: 409 };
        if (quantity === 0) await tx.delete(potluckClaims).where(and(eq(potluckClaims.itemId, itemId), eq(potluckClaims.guestId, guest.id)));
        else
          await tx
            .insert(potluckClaims)
            .values({ itemId, eventId: event.id, guestId: guest.id, quantity })
            .onConflictDoUpdate({ target: [potluckClaims.itemId, potluckClaims.guestId], set: { quantity } });
        return null;
      });
      if (result) return reply.code(result.code).send({ error: result.error });
      return { potluck: await publicPotluck(event, guest) };
    },
  );

  // --- date poll vote ---------------------------------------------------------
  app.post(
    "/public/events/:slug/poll/vote",
    {
      schema: {
        params: slugParams,
        body: z.object({
          token: z.string().uuid(),
          votes: z.array(z.object({ optionId: z.string().uuid(), answer: z.enum(["yes", "maybe", "no"]) })).max(10),
        }),
      },
    },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const { token, votes } = req.body as { token: string; votes: { optionId: string; answer: string }[] };
      const event = await loadPublished(slug);
      if (!event) return reply.code(404).send({ error: "not_found" });
      if (event.datePollStatus !== "open") return reply.code(409).send({ error: "poll_closed" });
      const guest = await guestByToken(event.id, token);
      if (!guest) return reply.code(403).send({ error: "invitation_required" });
      const valid = new Set(
        (await db.select({ id: datePollOptions.id }).from(datePollOptions).where(eq(datePollOptions.eventId, event.id))).map((o) => o.id),
      );
      const now = new Date();
      for (const v of votes) {
        if (!valid.has(v.optionId)) continue;
        await db
          .insert(datePollVotes)
          .values({ optionId: v.optionId, eventId: event.id, guestId: guest.id, answer: v.answer, updatedAt: now })
          .onConflictDoUpdate({ target: [datePollVotes.optionId, datePollVotes.guestId], set: { answer: v.answer, updatedAt: now } });
      }
      return { poll: await publicPoll(event, guest) };
    },
  );

  // --- shared photo album -----------------------------------------------------
  app.get(
    "/public/events/:slug/album",
    { schema: { params: slugParams, querystring: z.object({ t: z.string().uuid().optional() }) } },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const { t } = req.query as { t?: string };
      const event = await loadPublished(slug);
      if (!event || !albumVisible(event)) return reply.code(404).send({ error: "not_found" });
      const guest = await guestByToken(event.id, t);
      const rows = await db.select().from(albumPhotos).where(eq(albumPhotos.eventId, event.id)).orderBy(desc(albumPhotos.createdAt)).limit(ALBUM_MAX_PHOTOS);
      return {
        photos: await Promise.all(
          rows.map(async (p) => ({
            id: p.id,
            url: await presignDownload(p.imageKey),
            // First name only, like every public list.
            by: p.uploaderName ? claimerLabel(p.uploaderName) : null,
            mine: guest !== null && p.guestId === guest.id,
            createdAt: p.createdAt,
          })),
        ),
      };
    },
  );

  app.post(
    "/public/events/:slug/album/presign",
    { schema: { params: slugParams, body: z.object({ token: z.string().uuid().optional(), contentType: z.string().max(100), size: z.number().int() }) } },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const { token, contentType, size } = req.body as { token?: string; contentType: string; size: number };
      if (!writesPerIp(clientIp(req))) return reply.code(429).send({ error: "too_many_requests" });
      const event = await loadPublished(slug);
      if (!event) return reply.code(404).send({ error: "not_found" });
      const guest = await guestByToken(event.id, token);
      const [{ n }] = await db.select({ n: count() }).from(albumPhotos).where(eq(albumPhotos.eventId, event.id));
      const problem = uploadProblem({ event, uploader: "guest", hasGuestToken: guest !== null, currentCount: n, sizeBytes: size, contentType });
      if (problem || !isAllowedImageType(contentType)) {
        const code = problem === "invitation_required" ? 403 : problem === "album_full" ? 409 : problem === "album_disabled" ? 404 : 400;
        return reply.code(code).send({ error: problem ?? "unsupported_content_type" });
      }
      const key = albumImageKey(event.id, extForType(contentType));
      return { key, uploadUrl: await presignUploadSized(key, contentType, size) };
    },
  );

  app.post(
    "/public/events/:slug/album/photos",
    { schema: { params: slugParams, body: z.object({ token: z.string().uuid(), key: z.string().max(300) }) } },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const { token, key } = req.body as { token: string; key: string };
      const event = await loadPublished(slug);
      if (!event) return reply.code(404).send({ error: "not_found" });
      const guest = await guestByToken(event.id, token);
      if (!guest) return reply.code(403).send({ error: "invitation_required" });
      if (!isAlbumKeyFor(event.id, key)) return reply.code(400).send({ error: "invalid_image_key" });
      const head = await headObject(key);
      if (!head) return reply.code(400).send({ error: "upload_missing" });
      const [{ n }] = await db.select({ n: count() }).from(albumPhotos).where(eq(albumPhotos.eventId, event.id));
      const problem = uploadProblem({ event, uploader: "guest", hasGuestToken: true, currentCount: n, sizeBytes: head.size, contentType: head.contentType ?? "" });
      if (problem) {
        await deleteObject(key).catch(() => undefined);
        return reply.code(problem === "album_full" ? 409 : 400).send({ error: problem });
      }
      const [p] = await db
        .insert(albumPhotos)
        .values({ eventId: event.id, imageKey: key, contentType: head.contentType!, sizeBytes: head.size, guestId: guest.id, uploaderName: guest.name })
        .onConflictDoNothing()
        .returning({ id: albumPhotos.id });
      return reply.code(201).send({ id: p?.id ?? null });
    },
  );

  app.delete(
    "/public/events/:slug/album/photos/:photoId",
    { schema: { params: slugParams.extend({ photoId: z.string().uuid() }), querystring: z.object({ t: z.string().uuid() }) } },
    async (req, reply) => {
      const { slug, photoId } = req.params as { slug: string; photoId: string };
      const { t } = req.query as { t: string };
      const event = await loadPublished(slug);
      if (!event) return reply.code(404).send({ error: "not_found" });
      const guest = await guestByToken(event.id, t);
      if (!guest) return reply.code(403).send({ error: "invitation_required" });
      const [p] = await db.select().from(albumPhotos).where(and(eq(albumPhotos.id, photoId), eq(albumPhotos.eventId, event.id))).limit(1);
      if (!p) return reply.code(404).send({ error: "not_found" });
      if (!canRemovePhoto(p, { kind: "guest", guestId: guest.id })) return reply.code(403).send({ error: "not_yours" });
      await db.delete(albumPhotos).where(eq(albumPhotos.id, photoId));
      deleteObject(p.imageKey).catch((err) => req.log.warn({ err }, "album photo object not deleted"));
      return reply.code(204).send();
    },
  );
}
