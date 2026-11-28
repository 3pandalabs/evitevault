import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { events, guests, type Event } from "../db/schema.js";
import { buildReminderEmail } from "../lib/emails/extras.js";
import { eventWantsReminders, reminderStatuses, reminderWindow, selectReminderRecipients } from "../lib/features/reminders.js";
import { mailerConfigured } from "../lib/mailer.js";
import { sendGuestMail } from "../lib/testMode/index.js";

// Day-before reminders (migration 0015). Same shape and the same three
// properties as jobs/pendingInvitations.ts:
//
// - It cannot double-send: it selects guests with reminder_sent_at null, and
//   writes reminder_sent_at (conditionally, still null) only for addresses the
//   gateway accepted. A failed address stays eligible for the next hourly tick
//   while the event is still inside the window.
// - Soonest event first, so a partial allowance serves tonight's party first.
// - It stops at the first quota_exceeded: the rest would be rejections.
//
// Test mode (lib/testMode): sendGuestMail suppresses every address but the
// admin's own; suppressed guests are not marked, which only means the next
// tick suppresses them again until the window closes.

const EVERY_MS = 60 * 60 * 1000;
// Offset from the invitations job so the two do not hit the gateway together.
const FIRST_RUN_MS = 7 * 60 * 1000;
const MAX_EVENTS_PER_RUN = 25;

export type ReminderRun = { events: number; delivered: number; failed: number; quotaHit: boolean };

export async function sendDueReminders(log: (msg: string) => void, now = new Date()): Promise<ReminderRun> {
  const summary: ReminderRun = { events: 0, delivered: 0, failed: 0, quotaHit: false };
  if (!mailerConfigured()) return summary;

  const { from, to } = reminderWindow(now);
  const candidates = await db
    .select()
    .from(events)
    .where(and(eq(events.status, "published"), eq(events.remindersEnabled, true), gte(events.startsAt, from), lte(events.startsAt, to)))
    .orderBy(asc(events.startsAt))
    .limit(MAX_EVENTS_PER_RUN);

  for (const event of candidates as Event[]) {
    if (!eventWantsReminders(event, now)) continue;
    const rows = await db
      .select()
      .from(guests)
      .where(
        and(
          eq(guests.eventId, event.id),
          isNotNull(guests.email),
          isNull(guests.reminderSentAt),
          inArray(guests.rsvpStatus, reminderStatuses(event)),
        ),
      );
    const recipients = selectReminderRecipients(event, rows);
    if (recipients.length === 0) continue;

    const result = await sendGuestMail(event.hostId, recipients.map((g) => buildReminderEmail(event, g)), log);
    const notDelivered = new Set([...result.failedRecipients, ...result.suppressedRecipients].map((a) => a.toLowerCase()));
    const delivered = recipients.filter((g) => !notDelivered.has(g.email!.toLowerCase()));
    if (result.skipped === 0 && delivered.length) {
      await db
        .update(guests)
        .set({ reminderSentAt: new Date() })
        .where(and(inArray(guests.id, delivered.map((g) => g.id)), isNull(guests.reminderSentAt)));
    }

    summary.events += 1;
    summary.delivered += result.delivered;
    summary.failed += result.failed;
    log(`reminders event=${event.id} delivered=${result.delivered} failed=${result.failed} testSuppressed=${result.testSuppressed}`);

    if (result.quotaExhausted) {
      summary.quotaHit = true;
      log("reminders: daily send allowance spent, skipping the rest until the next run");
      break;
    }
  }
  return summary;
}

export function startRemindersJob(log: (msg: string) => void): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await sendDueReminders(log);
      if (r.events > 0) log(`reminders run: events=${r.events} delivered=${r.delivered} failed=${r.failed}`);
    } catch (err) {
      log(`reminders failed: ${String(err)}`);
    } finally {
      running = false;
    }
  };
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), EVERY_MS).unref?.();
  }, FIRST_RUN_MS).unref?.();
}
