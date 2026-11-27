import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { events, gifts, users, videoInvites } from "../db/schema.js";
import { requireRealAdmin } from "../lib/testMode/index.js";
import { mayMarkInternal, mayMarkTest } from "../lib/testMode/policy.js";

// The admin area behind /dashboard/admin. Every route re-reads the caller's
// role from the DATABASE (requireRealAdmin) and refuses sessions inside a test
// host, so a demoted admin or a stale 15-minute JWT can't get in, and test
// mode never hides these pages from the real admin.
//
// "Ours" vs customers: admins, test hosts, internal and marked-test accounts
// are all ours. The SQL fragment below is the one definition of "a real
// customer", mirrored by isRealCustomer() in lib/testMode/policy.ts.

const REAL_HOST = sql`(u.role = 'host' and u.test_owner_id is null and not u.is_internal and not u.marked_test)`;

export async function adminRoutes(app: FastifyInstance) {
  app.register(async (admin) => {
    admin.addHook("onRequest", requireRealAdmin);

    // --- overview counts -------------------------------------------------------
    admin.get("/admin/overview", async () => {
      const r = await db.execute<Record<string, number>>(sql`
        select
          (select count(*) from users)::int as accounts,
          (select count(*) from users u where ${REAL_HOST})::int as real_hosts,
          (select count(*) from users where role = 'admin')::int as admins,
          (select count(*) from users where test_owner_id is not null)::int as test_hosts,
          (select count(*) from users where is_internal)::int as internal_accounts,
          (select count(*) from users where marked_test)::int as marked_test_accounts,
          (select count(*) from users u where ${REAL_HOST} and u.created_at > now() - interval '7 days')::int as new_hosts_7d,
          (select count(*) from events)::int as events,
          (select count(*) from events where status = 'published')::int as published_events,
          (select count(*) from events where status = 'published' and starts_at > now())::int as upcoming_events,
          (select count(*) from guests)::int as guests,
          (select count(*) from guests where rsvp_status = 'attending')::int as attending_guests,
          (select count(*) from greetings)::int as greetings,
          (select count(*) from video_invites where status = 'ready')::int as video_invites_ready,
          (select count(*) from video_invites where status in ('paid','generating'))::int as video_invites_in_queue,
          (select count(*) from video_invites where refund_needed and status <> 'refunded')::int as video_invites_refund_needed,
          (select coalesce(sum(v.price_cents), 0) from video_invites v join users u on u.id = v.host_id
             where v.paid_at is not null and not v.test_mode and v.status <> 'refunded' and ${REAL_HOST})::int as video_revenue_cents,
          (select count(*) from gifts where not test_mode and status = 'paid')::int as gifts_paid,
          (select count(*) from gifts where not test_mode and status = 'disputed')::int as gifts_disputed,
          (select coalesce(sum(amount_cents), 0) from gifts where not test_mode and status = 'paid')::int as gift_volume_cents,
          (select coalesce(sum(platform_fee_cents), 0) from gifts where not test_mode and status = 'paid')::int as gift_platform_fee_cents
      `);
      return r.rows[0];
    });

    // --- users -------------------------------------------------------------------
    admin.get(
      "/admin/users",
      { schema: { querystring: z.object({ q: z.string().max(200).optional() }) } },
      async (req) => {
        const { q } = req.query as { q?: string };
        const term = q?.trim();
        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            createdAt: users.createdAt,
            testAsHost: users.testAsHost,
            testOwnerId: users.testOwnerId,
            isInternal: users.isInternal,
            internalLabel: users.internalLabel,
            markedTest: users.markedTest,
            events: sql<number>`(select count(*) from events e where e.host_id = ${users.id})::int`,
            greetings: sql<number>`(select count(*) from greetings g where g.host_id = ${users.id})::int`,
          })
          .from(users)
          .where(term ? or(ilike(users.email, `%${term}%`), ilike(users.displayName, `%${term}%`)) : undefined)
          .orderBy(desc(users.createdAt))
          .limit(200);
        return { users: rows.map(({ testOwnerId, ...u }) => ({ ...u, testHost: testOwnerId !== null })) };
      },
    );

    // Internal / marked-test flags. Neither changes a price, a gate or email:
    // they only keep an account out of customer counts and revenue.
    admin.post(
      "/admin/users/:id/flags",
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.object({
            isInternal: z.boolean().optional(),
            internalLabel: z.string().trim().max(60).nullish(),
            markedTest: z.boolean().optional(),
          }),
        },
      },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { isInternal?: boolean; internalLabel?: string | null; markedTest?: boolean };
        const [u] = await db
          .select({ role: users.role, testOwnerId: users.testOwnerId })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        if (!u) return reply.code(404).send({ error: "not_found" });
        if (body.markedTest !== undefined && !mayMarkTest(u)) return reply.code(409).send({ error: "cannot_mark_test" });
        if (body.isInternal !== undefined && !mayMarkInternal(u)) return reply.code(409).send({ error: "cannot_mark_internal" });

        const patch: Partial<typeof users.$inferInsert> = {};
        if (body.isInternal !== undefined) {
          patch.isInternal = body.isInternal;
          patch.internalLabel = body.isInternal ? (body.internalLabel || null) : null;
        } else if (body.internalLabel !== undefined) {
          patch.internalLabel = body.internalLabel || null;
        }
        if (body.markedTest !== undefined) patch.markedTest = body.markedTest;
        if (Object.keys(patch).length === 0) return reply.code(400).send({ error: "nothing_to_change" });

        const [updated] = await db
          .update(users)
          .set(patch)
          .where(eq(users.id, id))
          .returning({ id: users.id, isInternal: users.isInternal, internalLabel: users.internalLabel, markedTest: users.markedTest });
        req.log.info({ admin: req.userId, user: id, patch }, "admin changed account flags");
        return updated;
      },
    );

    // --- events -------------------------------------------------------------------
    admin.get(
      "/admin/events",
      { schema: { querystring: z.object({ q: z.string().max(200).optional() }) } },
      async (req) => {
        const { q } = req.query as { q?: string };
        const term = q?.trim();
        const rows = await db
          .select({
            id: events.id,
            title: events.title,
            status: events.status,
            startsAt: events.startsAt,
            createdAt: events.createdAt,
            hostEmail: users.email,
            hostTest: sql<boolean>`(${users.testOwnerId} is not null or ${users.markedTest} or ${users.role} = 'admin')`,
            guests: sql<number>`(select count(*) from guests x where x.event_id = ${events.id})::int`,
            attending: sql<number>`(select count(*) from guests x where x.event_id = ${events.id} and x.rsvp_status = 'attending')::int`,
          })
          .from(events)
          .innerJoin(users, eq(users.id, events.hostId))
          .where(term ? or(ilike(events.title, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined)
          .orderBy(desc(events.createdAt))
          .limit(200);
        return { events: rows };
      },
    );

    // --- video invite orders (the refund queue first) ----------------------------
    admin.get(
      "/admin/video-invites",
      { schema: { querystring: z.object({ refundNeeded: z.enum(["1"]).optional() }) } },
      async (req) => {
        const { refundNeeded } = req.query as { refundNeeded?: "1" };
        const rows = await db
          .select({
            id: videoInvites.id,
            eventId: videoInvites.eventId,
            eventTitle: events.title,
            hostEmail: users.email,
            tier: videoInvites.tier,
            status: videoInvites.status,
            provider: videoInvites.provider,
            priceCents: videoInvites.priceCents,
            testMode: videoInvites.testMode,
            refundNeeded: videoInvites.refundNeeded,
            stripePaymentIntent: videoInvites.stripePaymentIntent,
            error: videoInvites.error,
            attempts: videoInvites.attempts,
            createdAt: videoInvites.createdAt,
            paidAt: videoInvites.paidAt,
          })
          .from(videoInvites)
          .innerJoin(events, eq(events.id, videoInvites.eventId))
          .innerJoin(users, eq(users.id, videoInvites.hostId))
          .where(
            refundNeeded
              ? and(eq(videoInvites.refundNeeded, true), sql`${videoInvites.status} <> 'refunded'`)
              : undefined,
          )
          .orderBy(desc(videoInvites.refundNeeded), desc(videoInvites.createdAt))
          .limit(200);
        return { orders: rows };
      },
    );

    // --- cash gifts (disputes first: the platform is liable) ---------------------
    admin.get("/admin/gifts", async () => {
      const rows = await db
        .select({
          id: gifts.id,
          eventTitle: events.title,
          hostEmail: users.email,
          guestName: gifts.guestName,
          amountCents: gifts.amountCents,
          platformFeeCents: gifts.platformFeeCents,
          totalCents: gifts.totalCents,
          status: gifts.status,
          testMode: gifts.testMode,
          stripePaymentIntent: gifts.stripePaymentIntent,
          destinationAccount: gifts.destinationAccount,
          createdAt: gifts.createdAt,
          paidAt: gifts.paidAt,
          disputedAt: gifts.disputedAt,
        })
        .from(gifts)
        .innerJoin(events, eq(events.id, gifts.eventId))
        .innerJoin(users, eq(users.id, gifts.hostId))
        .where(sql`${gifts.status} <> 'expired'`)
        .orderBy(sql`(${gifts.status} = 'disputed') desc`, desc(gifts.createdAt))
        .limit(300);
      return { gifts: rows };
    });

    // Ops refunded the order in Stripe: record it (failed -> refunded).
    admin.post(
      "/admin/video-invites/:id/refunded",
      { schema: { params: z.object({ id: z.string().uuid() }) } },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const [row] = await db
          .update(videoInvites)
          .set({ status: "refunded", refundNeeded: false, updatedAt: new Date() })
          .where(and(eq(videoInvites.id, id), eq(videoInvites.status, "failed")))
          .returning({ id: videoInvites.id, status: videoInvites.status });
        if (!row) return reply.code(409).send({ error: "not_failed" });
        req.log.info({ admin: req.userId, order: id }, "video invite marked refunded");
        return row;
      },
    );
  });
}
