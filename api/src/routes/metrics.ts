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
        (select count(*) from sessions where expires_at > now())::int as active_sessions
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
