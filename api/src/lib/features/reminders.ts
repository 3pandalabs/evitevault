// Day-before reminder (migration 0015, jobs/reminders.ts). Pure selection and
// dedupe rules, tested in reminders.test.ts.
//
// Who gets one: guests with an email who said "going" (and "maybe" when the
// host ticked that), on a published event with reminders on, whose start is
// inside the window below, and who have never had one (reminder_sent_at is
// written from the send result, so a guest is reminded at most once, ever).
// Pending / declined / waitlisted guests are never reminded: the one-invite
// rule means nobody who did not say yes gets a second unsolicited email.

/** Earliest start (from now) worth reminding: closer than this, it is too late to help. */
export const REMINDER_MIN_LEAD_MS = 2 * 60 * 60 * 1000;
/** Latest start (from now): roughly "the day before", with an hourly job's slack. */
export const REMINDER_MAX_LEAD_MS = 30 * 60 * 60 * 1000;

export function reminderWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() + REMINDER_MIN_LEAD_MS),
    to: new Date(now.getTime() + REMINDER_MAX_LEAD_MS),
  };
}

export type ReminderEvent = {
  status: string;
  remindersEnabled: boolean;
  reminderIncludeMaybe: boolean;
  startsAt: Date;
};

export type ReminderGuest = {
  email: string | null;
  rsvpStatus: string;
  reminderSentAt: Date | null;
};

export function eventWantsReminders(ev: ReminderEvent, now: Date): boolean {
  if (ev.status !== "published" || !ev.remindersEnabled) return false;
  const { from, to } = reminderWindow(now);
  return ev.startsAt.getTime() >= from.getTime() && ev.startsAt.getTime() <= to.getTime();
}

export function reminderStatuses(ev: Pick<ReminderEvent, "reminderIncludeMaybe">): string[] {
  return ev.reminderIncludeMaybe ? ["attending", "maybe"] : ["attending"];
}

export function guestNeedsReminder(ev: ReminderEvent, g: ReminderGuest): boolean {
  if (!g.email || g.reminderSentAt) return false;
  return reminderStatuses(ev).includes(g.rsvpStatus);
}

/**
 * Dedupe a batch by address (two guest rows can never share one on an event,
 * but a host-edited row may differ only in case) and drop anyone already sent.
 */
export function selectReminderRecipients<G extends ReminderGuest>(ev: ReminderEvent, guests: G[]): G[] {
  const seen = new Set<string>();
  const out: G[] = [];
  for (const g of guests) {
    if (!guestNeedsReminder(ev, g)) continue;
    const key = g.email!.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** A Google Maps search link for the address when the host gave no map link. */
export function mapLinkFor(ev: { locationMapUrl: string | null; locationName: string | null; locationAddress: string | null }): string | null {
  if (ev.locationMapUrl) return ev.locationMapUrl;
  const q = [ev.locationName, ev.locationAddress].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
