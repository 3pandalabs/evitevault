import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { events, guests, type Event } from "../db/schema.js";
import { markDelivered, recipientsByAddress, sendInvitations } from "../lib/invitations.js";
import { mailerConfigured } from "../lib/mailer.js";

// Finishes guest lists that the day's mail allowance could not.
//
// WHY THIS EXISTS. The shared gateway allows this app a fixed number of
// messages per UTC day (60 at the time of writing, on Resend's free plan). A
// hundred-guest list therefore sends sixty invitations and rejects forty, and
// before this job the remaining forty waited for the host to notice the
// dashboard and press a button again tomorrow. Nobody should have to run a
// mail queue by hand, and a host who doesn't come back has forty guests who
// were never invited to a real event.
//
// It is not a general retry. It sends to guests who have an address and have
// never been reached, which is precisely what `invitedAt is null` means now
// that the column is written from send results. Nothing is re-sent, so a
// crash-loop or an overlapping run cannot double-mail anyone: the guests the
// previous run delivered to no longer match.

const EVERY_MS = 60 * 60 * 1000;

// Soon after boot, not immediately: migrations and the template seed run first
// in the container's CMD, and a deploy should not race them.
const FIRST_RUN_MS = 2 * 60 * 1000;

// A bound on one pass, not a budget. The gateway's allowance is the real limit
// and this stops long before reaching it; the cap only keeps a pathological
// account from turning one tick into an unbounded scan.
const MAX_EVENTS_PER_RUN = 25;

export type PendingRun = { events: number; delivered: number; failed: number };

export async function sendPendingInvitations(
  log: (msg: string) => void,
): Promise<PendingRun> {
  const summary: PendingRun = { events: 0, delivered: 0, failed: 0 };
  if (!mailerConfigured()) return summary;

  // Soonest event first. When the allowance only covers part of what is
  // waiting, the wedding this Saturday should get it before the one in March —
  // a late invitation to a near event is worth much more than to a far one.
  //
  // Past events are excluded: an invitation that arrives after the day has
  // been and gone is worse than no invitation, and it would spend allowance
  // that a live event needs.
  // Grouped by the primary key, so selecting startsAt alongside it is legal
  // without aggregating — Postgres resolves the functional dependency. The
  // join is what filters to events that actually have someone waiting; the
  // group collapses the duplicate rows that join produces.
  const candidates = await db
    .select({ id: events.id, startsAt: events.startsAt })
    .from(events)
    .innerJoin(guests, eq(guests.eventId, events.id))
    .where(
      and(
        eq(events.status, "published"),
        gt(events.startsAt, new Date()),
        isNotNull(guests.email),
        isNull(guests.invitedAt),
      ),
    )
    .groupBy(events.id)
    .orderBy(asc(events.startsAt))
    .limit(MAX_EVENTS_PER_RUN);

  for (const { id: eventId } of candidates) {
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) continue;

    const pending = await db
      .select()
      .from(guests)
      .where(
        and(eq(guests.eventId, eventId), isNotNull(guests.email), isNull(guests.invitedAt)),
      );
    if (pending.length === 0) continue;

    const result = await sendInvitations(event as Event, pending, log);
    const failedGuests = recipientsByAddress(pending, result.failedRecipients);
    await markDelivered(eventId, pending, failedGuests);

    summary.events += 1;
    summary.delivered += result.delivered;
    summary.failed += result.failed;
    log(
      `scheduled invitations event=${eventId} delivered=${result.delivered} failed=${result.failed}`,
    );

    // Stop the moment the allowance is gone. Carrying on would send the next
    // event's whole list straight into rejections — no mail, a pile of log
    // noise, and the soonest-first ordering above silently undone, because
    // every remaining event would be equally rejected rather than the nearest
    // one being served first tomorrow.
    if (result.quotaExhausted) {
      log("scheduled invitations: daily send allowance spent, stopping until tomorrow");
      break;
    }
  }

  return summary;
}

// Started from index.ts. A plain interval rather than a cron service: this API
// is a single long-running container, so there is exactly one of these, and a
// second scheduler would mean another deployable to keep alive and another
// credential to hold. Missing a tick costs an hour, which against a quota that
// resets once a day is nothing.
export function startPendingInvitationsJob(log: (msg: string) => void): void {
  let running = false;

  const tick = async () => {
    // Runs are not re-entrant. A pass that is still waiting on the gateway
    // must not have the next hour's pass start behind it and send the same
    // guests — invitedAt is only written after a send returns.
    if (running) return;
    running = true;
    try {
      const result = await sendPendingInvitations(log);
      if (result.events > 0) {
        log(
          `scheduled invitations run: events=${result.events} delivered=${result.delivered} failed=${result.failed}`,
        );
      }
    } catch (err) {
      // Never throw out of a timer. An unhandled rejection here would take the
      // whole API down over undelivered invitations, which inverts the
      // priority completely.
      log(`scheduled invitations failed: ${String(err)}`);
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), EVERY_MS).unref?.();
  }, FIRST_RUN_MS).unref?.();
}
