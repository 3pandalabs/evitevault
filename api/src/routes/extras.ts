import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
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
  rsvpLog,
  users,
  type Event,
} from "../db/schema.js";
import { env } from "../env.js";
import { loadManagedEvent } from "../lib/eventAccess.js";
import { buildApprovalEmail, buildCohostInviteEmail, buildDatePickedEmail } from "../lib/emails/extras.js";
import { albumEntryName, ZipWriter } from "../lib/features/zip.js";
import { ALBUM_MAX_PHOTOS, isAlbumKeyFor, uploadProblem } from "../lib/features/album.js";
import { acceptProblem, MAX_COHOSTS } from "../lib/features/cohosts.js";
import { MAX_ITEMS } from "../lib/features/potluck.js";
import { optionsProblem, shouldNotifyOfDate, tallyPoll } from "../lib/features/poll.js";
import { questionsSchema } from "../lib/features/questions.js";
import { approvalProblem, approvedValues, declinedValues } from "../lib/features/rsvpRules.js";
import { mailerConfigured } from "../lib/mailer.js";
import { sendGuestMail } from "../lib/testMode/index.js";
import {
  albumImageKey,
  deleteObject,
  extForType,
  getObjectBytes,
  headObject,
  isAllowedImageType,
  presignDownload,
  presignUploadSized,
} from "../plugins/r2.js";

// Host-side routes for the free host features (migration 0015). Every route is
// behind requireAuth and goes through loadManagedEvent: the owner or an
// accepted co-host, with the action checked against lib/features/cohosts.ts.
// Guest-side counterparts are in routes/publicExtras.ts. Listed in ROUTES.md
// under "Free host features".

const eventParams = z.object({ eventId: z.string().uuid() });
const mailSummary = (r: { delivered: number; failed: number; skipped: number; testSuppressed: number; quotaExhausted: boolean }) => ({
  emailed: r.delivered,
  emailsFailed: r.failed + r.skipped,
  testNotSent: r.testSuppressed,
  quotaExhausted: r.quotaExhausted,
  emailConfigured: mailerConfigured(),
});

async function displayName(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? null;
}

export async function extrasRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // =========================================================================
  // Waitlist + approval
  // =========================================================================
  const guestParams = eventParams.extend({ guestId: z.string().uuid() });

  for (const decision of ["approve", "decline"] as const) {
    app.post(`/events/:eventId/guests/:guestId/${decision}`, { schema: { params: guestParams } }, async (req, reply) => {
      const { eventId, guestId } = req.params as z.infer<typeof guestParams>;
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_guests");
      if (!event) return;
      const [guest] = await db.select().from(guests).where(and(eq(guests.id, guestId), eq(guests.eventId, eventId))).limit(1);
      if (!guest) return reply.code(404).send({ error: "not_found" });
      const problem = approvalProblem(guest);
      if (problem) return reply.code(409).send({ error: problem });

      const now = new Date();
      const values = decision === "approve" ? approvedValues(now) : declinedValues(now);
      // Conditional on still waiting, so two co-hosts clicking at once decide once.
      const [updated] = await db
        .update(guests)
        .set(values)
        .where(and(eq(guests.id, guestId), eq(guests.rsvpStatus, "waitlisted"), eq(guests.approvalStatus, "pending")))
        .returning();
      if (!updated) return reply.code(409).send({ error: "not_waitlisted" });
      await db.insert(rsvpLog).values({ guestId, eventId, previousStatus: "waitlisted", newStatus: updated.rsvpStatus, plusOnes: updated.plusOnes });

      // One email, on approval only (a "no" is not chased). Quota-aware: when
      // the allowance is spent the approval still stands; the host is told the
      // guest was not emailed and can tell them another way.
      if (decision === "approve" && updated.email && event.status === "published") {
        const r = await sendGuestMail(event.hostId, [buildApprovalEmail(event, updated)], (m) => req.log.info({ eventId }, m));
        if (r.delivered > 0) await db.update(guests).set({ approvalNotifiedAt: new Date() }).where(eq(guests.id, guestId));
        return { guest: updated, ...mailSummary(r) };
      }
      return { guest: updated, emailed: 0, emailsFailed: 0, testNotSent: 0, quotaExhausted: false, emailConfigured: mailerConfigured() };
    });
  }

  // =========================================================================
  // Custom RSVP questions
  // =========================================================================
  app.put(
    "/events/:eventId/questions",
    { schema: { params: eventParams, body: z.object({ questions: questionsSchema }) } },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { questions } = req.body as { questions: z.infer<typeof questionsSchema> };
      if (!(await loadManagedEvent(eventId, req.userId!, reply, "edit"))) return;
      const [updated] = await db
        .update(events)
        .set({ rsvpQuestions: questions, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning({ rsvpQuestions: events.rsvpQuestions });
      return { questions: updated.rsvpQuestions ?? [] };
    },
  );

  // =========================================================================
  // Co-hosts
  // =========================================================================
  app.get("/events/:eventId/cohosts", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
    if (!event) return;
    const rows = await db
      .select({
        id: eventCohosts.id,
        name: eventCohosts.name,
        email: eventCohosts.email,
        status: eventCohosts.status,
        invitedAt: eventCohosts.invitedAt,
        acceptedAt: eventCohosts.acceptedAt,
        inviteToken: eventCohosts.inviteToken,
      })
      .from(eventCohosts)
      .where(eq(eventCohosts.eventId, eventId))
      .orderBy(asc(eventCohosts.invitedAt));
    const owner = event.myRole === "owner";
    return {
      myRole: event.myRole,
      // Only the owner sees pending accept links (they are credentials for that address).
      cohosts: rows.map(({ inviteToken, ...r }) => ({
        ...r,
        acceptUrl: owner && r.status === "invited" ? `${env.WEB_ORIGIN}/cohost?token=${inviteToken}` : null,
      })),
    };
  });

  app.post(
    "/events/:eventId/cohosts",
    {
      schema: {
        params: eventParams,
        body: z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(320) }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const body = req.body as { name: string; email: string };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_cohosts");
      if (!event) return;
      const email = body.email.toLowerCase();

      const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, event.hostId)).limit(1);
      if (owner?.email.toLowerCase() === email) return reply.code(409).send({ error: "owner_cannot_cohost" });
      const [{ n }] = await db.select({ n: count() }).from(eventCohosts).where(eq(eventCohosts.eventId, eventId));
      if (n >= MAX_COHOSTS) return reply.code(409).send({ error: "too_many_cohosts" });

      const [created] = await db
        .insert(eventCohosts)
        .values({ eventId, invitedBy: req.userId!, name: body.name, email })
        .onConflictDoNothing()
        .returning();
      if (!created) return reply.code(409).send({ error: "already_invited" });

      const r = await sendGuestMail(event.hostId, [buildCohostInviteEmail(event, created, await displayName(event.hostId))], (m) =>
        req.log.info({ eventId }, m),
      );
      return reply.code(201).send({
        cohost: { id: created.id, name: created.name, email: created.email, status: created.status },
        // Shown to the owner so they can send it themselves when mail did not go out.
        acceptUrl: `${env.WEB_ORIGIN}/cohost?token=${created.inviteToken}`,
        ...mailSummary(r),
      });
    },
  );

  app.delete(
    "/events/:eventId/cohosts/:cohostId",
    { schema: { params: eventParams.extend({ cohostId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId, cohostId } = req.params as { eventId: string; cohostId: string };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
      if (!event) return;
      const [row] = await db.select().from(eventCohosts).where(and(eq(eventCohosts.id, cohostId), eq(eventCohosts.eventId, eventId))).limit(1);
      if (!row) return reply.code(404).send({ error: "not_found" });
      // The owner removes anyone; a co-host may only step down themselves.
      if (event.myRole !== "owner" && row.userId !== req.userId) return reply.code(403).send({ error: "owner_only" });
      await db.delete(eventCohosts).where(eq(eventCohosts.id, cohostId));
      return reply.code(204).send();
    },
  );

  const tokenParams = z.object({ token: z.string().uuid() });

  app.get("/cohost-invites/:token", { schema: { params: tokenParams } }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const [row] = await db
      .select({ invite: eventCohosts, title: events.title, startsAt: events.startsAt, timezone: events.timezone, hostId: events.hostId })
      .from(eventCohosts)
      .innerJoin(events, eq(events.id, eventCohosts.eventId))
      .where(eq(eventCohosts.inviteToken, token))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const [me] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, req.userId!)).limit(1);
    const problem = me ? acceptProblem({ ...row.invite, eventHostId: row.hostId }, me) : "email_mismatch";
    return {
      eventId: row.invite.eventId,
      title: row.title,
      startsAt: row.startsAt,
      timezone: row.timezone,
      status: row.invite.status,
      // The invited address is shown only to its owner (or as a hint when it is not them).
      invitedEmailHint: row.invite.email.replace(/^(.).*(@.*)$/, "$1…$2"),
      problem: problem === "already_accepted" && row.invite.userId === req.userId ? null : problem,
      alreadyYours: row.invite.userId === req.userId,
    };
  });

  app.post("/cohost-invites/:token/accept", { schema: { params: tokenParams } }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const [row] = await db
      .select({ invite: eventCohosts, hostId: events.hostId })
      .from(eventCohosts)
      .innerJoin(events, eq(events.id, eventCohosts.eventId))
      .where(eq(eventCohosts.inviteToken, token))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const [me] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!me) return reply.code(401).send({ error: "not_authenticated" });
    if (row.invite.userId === me.id) return { eventId: row.invite.eventId };
    const problem = acceptProblem({ ...row.invite, eventHostId: row.hostId }, me);
    if (problem) return reply.code(409).send({ error: problem });
    const [done] = await db
      .update(eventCohosts)
      .set({ status: "accepted", userId: me.id, acceptedAt: new Date() })
      .where(and(eq(eventCohosts.id, row.invite.id), eq(eventCohosts.status, "invited")))
      .returning({ eventId: eventCohosts.eventId });
    if (!done) return reply.code(409).send({ error: "already_accepted" });
    return { eventId: done.eventId };
  });

  // =========================================================================
  // Potluck
  // =========================================================================
  const itemBody = z.object({
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().max(300).nullish(),
    quantity: z.number().int().min(1).max(100).default(1),
  });

  async function potluckView(eventId: string) {
    const items = await db.select().from(potluckItems).where(eq(potluckItems.eventId, eventId)).orderBy(asc(potluckItems.sortOrder), asc(potluckItems.createdAt));
    const claims = await db
      .select({ itemId: potluckClaims.itemId, quantity: potluckClaims.quantity, guestId: potluckClaims.guestId, guestName: guests.name })
      .from(potluckClaims)
      .innerJoin(guests, eq(guests.id, potluckClaims.guestId))
      .where(eq(potluckClaims.eventId, eventId));
    return {
      items: items.map((i) => {
        const mine = claims.filter((c) => c.itemId === i.id);
        return { ...i, claimed: mine.reduce((s, c) => s + c.quantity, 0), claims: mine.map((c) => ({ guestId: c.guestId, name: c.guestName, quantity: c.quantity })) };
      }),
    };
  }

  app.get("/events/:eventId/potluck", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
    if (!event) return;
    return { enabled: event.potluckEnabled, ...(await potluckView(eventId)) };
  });

  app.post("/events/:eventId/potluck/items", { schema: { params: eventParams, body: itemBody } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const body = req.body as z.infer<typeof itemBody>;
    if (!(await loadManagedEvent(eventId, req.userId!, reply, "manage_extras"))) return;
    const [{ n }] = await db.select({ n: count() }).from(potluckItems).where(eq(potluckItems.eventId, eventId));
    if (n >= MAX_ITEMS) return reply.code(409).send({ error: "too_many_items" });
    await db.insert(potluckItems).values({ eventId, name: body.name, note: body.note ?? null, quantity: body.quantity, sortOrder: n });
    return reply.code(201).send(await potluckView(eventId));
  });

  const itemParams = eventParams.extend({ itemId: z.string().uuid() });
  app.patch("/events/:eventId/potluck/items/:itemId", { schema: { params: itemParams, body: itemBody.partial() } }, async (req, reply) => {
    const { eventId, itemId } = req.params as z.infer<typeof itemParams>;
    const body = req.body as Partial<z.infer<typeof itemBody>>;
    if (!(await loadManagedEvent(eventId, req.userId!, reply, "manage_extras"))) return;
    const [u] = await db
      .update(potluckItems)
      .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.note !== undefined ? { note: body.note ?? null } : {}), ...(body.quantity !== undefined ? { quantity: body.quantity } : {}) })
      .where(and(eq(potluckItems.id, itemId), eq(potluckItems.eventId, eventId)))
      .returning({ id: potluckItems.id });
    if (!u) return reply.code(404).send({ error: "not_found" });
    return potluckView(eventId);
  });

  app.delete("/events/:eventId/potluck/items/:itemId", { schema: { params: itemParams } }, async (req, reply) => {
    const { eventId, itemId } = req.params as z.infer<typeof itemParams>;
    if (!(await loadManagedEvent(eventId, req.userId!, reply, "manage_extras"))) return;
    await db.delete(potluckItems).where(and(eq(potluckItems.id, itemId), eq(potluckItems.eventId, eventId)));
    return potluckView(eventId);
  });

  // =========================================================================
  // Date poll
  // =========================================================================
  async function pollView(event: Event) {
    const options = await db.select().from(datePollOptions).where(eq(datePollOptions.eventId, event.id)).orderBy(asc(datePollOptions.startsAt));
    const votes = await db
      .select({ optionId: datePollVotes.optionId, answer: datePollVotes.answer, guestId: datePollVotes.guestId, name: guests.name })
      .from(datePollVotes)
      .innerJoin(guests, eq(guests.id, datePollVotes.guestId))
      .where(eq(datePollVotes.eventId, event.id));
    const tallies = tallyPoll(options, votes);
    return {
      status: event.datePollStatus,
      closedAt: event.datePollClosedAt,
      options: options.map((o) => ({
        id: o.id,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        tally: tallies.find((t) => t.optionId === o.id)!,
        voters: votes.filter((v) => v.optionId === o.id).map((v) => ({ name: v.name, answer: v.answer })),
      })),
      ranking: tallies.map((t) => t.optionId),
      voterCount: new Set(votes.map((v) => v.guestId)).size,
    };
  }

  app.get("/events/:eventId/poll", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
    if (!event) return;
    return pollView(event);
  });

  // Replaces the options and opens the poll. Changing options clears the votes
  // for options that went away (cascade); unchanged times keep theirs.
  app.put(
    "/events/:eventId/poll",
    {
      schema: {
        params: eventParams,
        body: z.object({ options: z.array(z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date().nullish() })).max(10) }),
      },
    },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { options } = req.body as { options: { startsAt: Date; endsAt?: Date | null }[] };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_extras");
      if (!event) return;
      if (event.datePollStatus === "closed") return reply.code(409).send({ error: "poll_closed" });
      const problem = optionsProblem(options, new Date());
      if (problem) return reply.code(400).send({ error: problem });

      const existing = await db.select().from(datePollOptions).where(eq(datePollOptions.eventId, eventId));
      const keep = new Set(options.map((o) => o.startsAt.getTime()));
      const gone = existing.filter((e) => !keep.has(e.startsAt.getTime())).map((e) => e.id);
      if (gone.length) await db.delete(datePollOptions).where(inArray(datePollOptions.id, gone));
      const have = new Map(existing.map((e) => [e.startsAt.getTime(), e]));
      for (const o of options) {
        const e = have.get(o.startsAt.getTime());
        if (e) await db.update(datePollOptions).set({ endsAt: o.endsAt ?? null }).where(eq(datePollOptions.id, e.id));
        else await db.insert(datePollOptions).values({ eventId, startsAt: o.startsAt, endsAt: o.endsAt ?? null });
      }
      const [updated] = await db.update(events).set({ datePollStatus: "open", updatedAt: new Date() }).where(eq(events.id, eventId)).returning();
      return pollView(updated);
    },
  );

  app.delete("/events/:eventId/poll", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    if (!(await loadManagedEvent(eventId, req.userId!, reply, "manage_extras"))) return;
    await db.delete(datePollOptions).where(eq(datePollOptions.eventId, eventId));
    await db.update(events).set({ datePollStatus: null, datePollClosedAt: null, updatedAt: new Date() }).where(eq(events.id, eventId));
    return reply.code(204).send();
  });

  // Picks an option: sets the event's date, closes the poll (once — the
  // conditional update is the dedupe), and sends ONE notice to guests we are
  // already in touch with (lib/features/poll.ts shouldNotifyOfDate).
  app.post(
    "/events/:eventId/poll/pick",
    { schema: { params: eventParams, body: z.object({ optionId: z.string().uuid(), notify: z.boolean().default(true) }) } },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { optionId, notify } = req.body as { optionId: string; notify: boolean };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_extras");
      if (!event) return;
      const [opt] = await db.select().from(datePollOptions).where(and(eq(datePollOptions.id, optionId), eq(datePollOptions.eventId, eventId))).limit(1);
      if (!opt) return reply.code(404).send({ error: "not_found" });

      const length = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
      const endsAt = opt.endsAt ?? (length !== null && length >= 0 ? new Date(opt.startsAt.getTime() + length) : null);
      const [updated] = await db
        .update(events)
        .set({ startsAt: opt.startsAt, endsAt, datePollStatus: "closed", datePollClosedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(events.id, eventId), eq(events.datePollStatus, "open")))
        .returning();
      if (!updated) return reply.code(409).send({ error: "poll_not_open" });

      if (!notify || updated.status !== "published") {
        return { event: updated, notified: 0, emailed: 0, emailsFailed: 0, testNotSent: 0, quotaExhausted: false, emailConfigured: mailerConfigured() };
      }
      const voters = new Set(
        (await db.select({ guestId: datePollVotes.guestId }).from(datePollVotes).where(eq(datePollVotes.eventId, eventId))).map((v) => v.guestId),
      );
      const list = (await db.select().from(guests).where(eq(guests.eventId, eventId))).filter((g) => shouldNotifyOfDate(g, voters.has(g.id)));
      const r = await sendGuestMail(updated.hostId, list.map((g) => buildDatePickedEmail(updated, g)), (m) => req.log.info({ eventId }, m));
      return { event: updated, notified: list.length, ...mailSummary(r) };
    },
  );

  // =========================================================================
  // Shared photo album (host side)
  // =========================================================================
  async function albumCount(eventId: string): Promise<number> {
    const [{ n }] = await db.select({ n: count() }).from(albumPhotos).where(eq(albumPhotos.eventId, eventId));
    return n;
  }

  app.get("/events/:eventId/album", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
    if (!event) return;
    const rows = await db.select().from(albumPhotos).where(eq(albumPhotos.eventId, eventId)).orderBy(asc(albumPhotos.createdAt));
    return {
      enabled: event.albumEnabled,
      guestUploads: event.albumGuestUploads,
      max: ALBUM_MAX_PHOTOS,
      photos: await Promise.all(
        rows.map(async (p) => ({ id: p.id, url: await presignDownload(p.imageKey), uploaderName: p.uploaderName, byGuest: p.guestId !== null, sizeBytes: p.sizeBytes, createdAt: p.createdAt })),
      ),
    };
  });

  app.post(
    "/events/:eventId/album/presign",
    { schema: { params: eventParams, body: z.object({ contentType: z.string().max(100), size: z.number().int() }) } },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { contentType, size } = req.body as { contentType: string; size: number };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_extras");
      if (!event) return;
      const problem = uploadProblem({ event, uploader: "host", hasGuestToken: false, currentCount: await albumCount(eventId), sizeBytes: size, contentType });
      if (problem || !isAllowedImageType(contentType)) return reply.code(problem === "album_full" ? 409 : 400).send({ error: problem ?? "unsupported_content_type" });
      const key = albumImageKey(eventId, extForType(contentType));
      return { key, uploadUrl: await presignUploadSized(key, contentType, size) };
    },
  );

  app.post(
    "/events/:eventId/album/photos",
    { schema: { params: eventParams, body: z.object({ key: z.string().max(300) }) } },
    async (req, reply) => {
      const { eventId } = req.params as z.infer<typeof eventParams>;
      const { key } = req.body as { key: string };
      const event = await loadManagedEvent(eventId, req.userId!, reply, "manage_extras");
      if (!event) return;
      if (!isAlbumKeyFor(eventId, key)) return reply.code(400).send({ error: "invalid_image_key" });
      const head = await headObject(key);
      if (!head) return reply.code(400).send({ error: "upload_missing" });
      const problem = uploadProblem({ event, uploader: "host", hasGuestToken: false, currentCount: await albumCount(eventId), sizeBytes: head.size, contentType: head.contentType ?? "" });
      if (problem) {
        await deleteObject(key).catch(() => undefined);
        return reply.code(problem === "album_full" ? 409 : 400).send({ error: problem });
      }
      const [p] = await db
        .insert(albumPhotos)
        .values({ eventId, imageKey: key, contentType: head.contentType!, sizeBytes: head.size, userId: req.userId!, uploaderName: (await displayName(req.userId!)) ?? "Host" })
        .onConflictDoNothing()
        .returning({ id: albumPhotos.id });
      return reply.code(201).send({ id: p?.id ?? null });
    },
  );

  app.delete(
    "/events/:eventId/album/photos/:photoId",
    { schema: { params: eventParams.extend({ photoId: z.string().uuid() }) } },
    async (req, reply) => {
      const { eventId, photoId } = req.params as { eventId: string; photoId: string };
      if (!(await loadManagedEvent(eventId, req.userId!, reply, "manage_extras"))) return;
      const [p] = await db.delete(albumPhotos).where(and(eq(albumPhotos.id, photoId), eq(albumPhotos.eventId, eventId))).returning();
      if (!p) return reply.code(404).send({ error: "not_found" });
      deleteObject(p.imageKey).catch((err) => req.log.warn({ err, key: p.imageKey }, "album photo object not deleted"));
      return reply.code(204).send();
    },
  );

  // "Download all": a STORE zip built one photo at a time and streamed out.
  app.get("/events/:eventId/album.zip", { schema: { params: eventParams } }, async (req, reply) => {
    const { eventId } = req.params as z.infer<typeof eventParams>;
    const event = await loadManagedEvent(eventId, req.userId!, reply, "view");
    if (!event) return;
    const rows = await db.select().from(albumPhotos).where(eq(albumPhotos.eventId, eventId)).orderBy(asc(albumPhotos.createdAt));
    if (rows.length === 0) return reply.code(404).send({ error: "album_empty" });
    await streamZip(reply, `album-${event.slug}.zip`, rows, (m, e) => req.log.warn({ err: e }, m));
  });
}

async function streamZip(
  reply: FastifyReply,
  filename: string,
  rows: { imageKey: string; uploaderName: string | null; createdAt: Date }[],
  warn: (m: string, e: unknown) => void,
) {
  const { PassThrough } = await import("node:stream");
  const out = new PassThrough();
  reply.header("content-type", "application/zip").header("content-disposition", `attachment; filename="${filename}"`);
  void (async () => {
    const zip = new ZipWriter();
    let i = 0;
    for (const r of rows) {
      try {
        const bytes = await getObjectBytes(r.imageKey);
        const ext = r.imageKey.split(".").pop() ?? "jpg";
        if (!out.write(zip.add(albumEntryName(i, r.uploaderName, ext), bytes, r.createdAt))) {
          await new Promise((res) => out.once("drain", res));
        }
        i += 1;
      } catch (err) {
        // One missing object should not abort the archive.
        warn("album zip: photo skipped", err);
      }
    }
    out.end(zip.finish());
  })().catch((err) => {
    warn("album zip failed", err);
    out.destroy(err as Error);
  });
  return reply.send(out);
}
