import { count, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { events, guests, users } from "../db/schema.js";
import { env } from "../env.js";
import { snapshot } from "../metrics/collector.js";

// Ops-only endpoint scraped by the 3pandalabs-admin Worker, which fans out to
// every app's /metrics server-side with one shared METRICS_TOKEN. Per the org
// convention every app exposes this and gets a per-app "Usage & resources"
// table on admin.3pandalabs.com. The app key here is `evitevault`.
export async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (req, reply) => {
    // 503, not 500: an unset token means the ops integration isn't configured,
    // which must never look like the app itself is unhealthy.
    if (!env.METRICS_TOKEN) {
      return reply.code(503).send({ error: "metrics_not_configured" });
    }

    const header = req.headers.authorization;
    if (header !== `Bearer ${env.METRICS_TOKEN}`) {
      return reply.code(401).send({ error: "not_authenticated" });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totals] = await db
      .select({
        events: count(),
        published: sql<number>`count(*) filter (where ${events.status} = 'published')::int`,
        upcoming: sql<number>`count(*) filter (where ${events.startsAt} > now() and ${events.status} = 'published')::int`,
      })
      .from(events);

    const [guestTotals] = await db
      .select({
        guests: count(),
        attending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'attending')::int`,
      })
      .from(guests);

    const [userTotals] = await db.select({ hosts: count() }).from(users);

    const [recent] = await db
      .select({ eventsLast30d: count() })
      .from(events)
      .where(gte(events.createdAt, thirtyDaysAgo));

    // `usage`, not `app` — snapshot() already carries the `app` key the admin
    // Worker uses to label the table, and spreading a second `app` here would
    // silently overwrite it.
    return {
      ...snapshot(),
      usage: {
        hosts: userTotals?.hosts ?? 0,
        events: totals?.events ?? 0,
        publishedEvents: totals?.published ?? 0,
        upcomingEvents: totals?.upcoming ?? 0,
        eventsLast30d: recent?.eventsLast30d ?? 0,
        guests: guestTotals?.guests ?? 0,
        attendingGuests: guestTotals?.attending ?? 0,
      },
    };
  });
}
