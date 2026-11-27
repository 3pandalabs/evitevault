import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { cpuPercentOfOneCore, requestsLastHour } from "../metrics/collector.js";

// Ops-only endpoint, scraped by the admin page (admin.3pandalabs.com). The
// admin Worker calls this server-side and holds the token as a Worker secret,
// so it never reaches a browser.
//
// Deliberately outside the product API surface: no JWT, its own bearer token,
// and aggregate counts only — nothing here identifies a user or names an event.
// Keep it that way; the response is proxied to a page whose only gate is
// Cloudflare Access.
//
// The response envelope (app/collectedAt/uptimeSeconds/counts/traffic/process/
// database) is shared across every 3PandaLabs app so the admin page's rendering
// script stays generic. Change the `counts` keys freely — that is the per-app
// part — but not the shape around them.

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first — the
  // length of a secret is not the part worth hiding.
  return a.length === b.length && timingSafeEqual(a, b);
}

type CountsRow = {
  hosts: number;
  events: number;
  published_events: number;
  upcoming_events: number;
  guests: number;
  attending_guests: number;
  guestbook_posts: number;
  active_sessions: number;
  video_invites_ready: number;
  video_invites_refund_needed: number;
  greetings: number;
  greeting_hosts: number;
  greetings_last_7_days: number;
  real_hosts: number;
  admins: number;
  test_hosts: number;
  internal_accounts: number;
  marked_test_accounts: number;
  video_invite_revenue_cents: number;
  video_invites_test_mode: number;
  gifts_paid: number;
  gifts_disputed: number;
  gift_volume_cents: number;
  gift_platform_fee_cents: number;
  gift_hosts_ready: number;
};

type DatabaseRow = {
  size_bytes: string;
  size_pretty: string;
  connections: number;
};

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (req, reply) => {
    if (!env.METRICS_TOKEN) {
      // Unset rather than wrong: the container still boots without the env var
      // so a deploy can never be bricked by a missing ops secret.
      return reply.code(503).send({ error: "metrics_disabled" });
    }

    const header = req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!tokenMatches(presented, env.METRICS_TOKEN)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const counts = await db.execute<CountsRow>(sql`
      select
        (select count(*) from users)::int as hosts,
        (select count(*) from events)::int as events,
        (select count(*) from events where status = 'published')::int as published_events,
        (select count(*) from events where status = 'published' and starts_at > now())::int as upcoming_events,
        (select count(*) from guests)::int as guests,
        (select count(*) from guests where rsvp_status = 'attending')::int as attending_guests,
        (select count(*) from guestbook_posts where status = 'visible')::int as guestbook_posts,
        (select count(*) from sessions where expires_at > now())::int as active_sessions,
        (select count(*) from video_invites where status = 'ready')::int as video_invites_ready,
        -- A work item, not a statistic: paid orders we could not deliver and
        -- have not refunded yet. Should be 0.
        (select count(*) from video_invites where refund_needed and status <> 'refunded')::int as video_invites_refund_needed,
        (select count(*) from greetings)::int as greetings,
        (select count(distinct host_id) from greetings)::int as greeting_hosts,
        (select count(*) from greetings where created_at > now() - interval '7 days')::int as greetings_last_7_days,
        -- Admin tools (lib/testMode): admins, test hosts, internal and
        -- marked-test accounts are ours, not customers. \`hosts\` above still
        -- counts every users row, as before.
        (select count(*) from users where role = 'host' and test_owner_id is null and not is_internal and not marked_test)::int as real_hosts,
        (select count(*) from users where role = 'admin')::int as admins,
        (select count(*) from users where test_owner_id is not null)::int as test_hosts,
        (select count(*) from users where is_internal)::int as internal_accounts,
        (select count(*) from users where marked_test)::int as marked_test_accounts,
        -- Real money only: paid, not test-mode, not refunded, from real customers.
        (select coalesce(sum(v.price_cents), 0) from video_invites v join users u on u.id = v.host_id
           where v.paid_at is not null and not v.test_mode and v.status <> 'refunded'
             and u.role = 'host' and u.test_owner_id is null and not u.is_internal and not u.marked_test)::int as video_invite_revenue_cents,
        (select count(*) from video_invites where test_mode)::int as video_invites_test_mode,
        -- Cash gifts (live only; test-mode gifts never count). giftsDisputed is
        -- a work item: the platform is liable, so each one needs ops action.
        (select count(*) from gifts where not test_mode and status = 'paid')::int as gifts_paid,
        (select count(*) from gifts where not test_mode and status = 'disputed')::int as gifts_disputed,
        (select coalesce(sum(amount_cents), 0) from gifts where not test_mode and status = 'paid')::int as gift_volume_cents,
        (select coalesce(sum(platform_fee_cents), 0) from gifts where not test_mode and status = 'paid')::int as gift_platform_fee_cents,
        (select count(*) from users where stripe_account_status = 'ready')::int as gift_hosts_ready
    `);

    const database = await db.execute<DatabaseRow>(sql`
      select
        pg_database_size(current_database()) as size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as size_pretty,
        (select count(*) from pg_stat_activity where datname = current_database())::int as connections
    `);

    const c = counts.rows[0];
    const d = database.rows[0];
    const mem = process.memoryUsage();

    return {
      app: "evitevault",
      collectedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      counts: {
        hosts: c.hosts,
        events: c.events,
        publishedEvents: c.published_events,
        upcomingEvents: c.upcoming_events,
        guests: c.guests,
        attendingGuests: c.attending_guests,
        guestbookPosts: c.guestbook_posts,
        activeSessions: c.active_sessions,
        videoInvitesReady: c.video_invites_ready,
        videoInvitesRefundNeeded: c.video_invites_refund_needed,
        greetings: c.greetings,
        greetingHosts: c.greeting_hosts,
        greetingsLast7Days: c.greetings_last_7_days,
        realHosts: c.real_hosts,
        admins: c.admins,
        testHosts: c.test_hosts,
        internalAccounts: c.internal_accounts,
        markedTestAccounts: c.marked_test_accounts,
        videoInviteRevenueCents: c.video_invite_revenue_cents,
        videoInvitesTestMode: c.video_invites_test_mode,
        giftsPaid: c.gifts_paid,
        giftsDisputed: c.gifts_disputed,
        giftVolumeCents: c.gift_volume_cents,
        giftPlatformFeeCents: c.gift_platform_fee_cents,
        giftHostsReady: c.gift_hosts_ready,
      },
      traffic: {
        // Rolling 60 minutes, in-process — see metrics/collector.ts. Resets on
        // restart, and counts only this replica.
        apiRequestsLastHour: requestsLastHour(),
      },
      process: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        cpuPercentOfOneCore: cpuPercentOfOneCore(),
      },
      database: {
        sizeBytes: Number(d.size_bytes),
        sizePretty: d.size_pretty,
        connections: d.connections,
      },
    };
  });
}
