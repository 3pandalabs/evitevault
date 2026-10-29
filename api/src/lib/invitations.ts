import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { guests, type Event, type Guest } from "../db/schema.js";
import { buildInvitationEmail } from "./emails/invitation.js";
import { sendMail, type SendResult } from "./mailer.js";

// Shared by the add-guests route and the publish route, which are the two ways
// an invitation goes out. It lived inside routes/guests.ts until publishing
// needed it too, and a route importing another route is the kind of tangle
// that ends with a circular import.

export type FailedGuest = { id: string; name: string; email: string };

export async function sendInvitations(
  event: Event,
  recipients: Guest[],
  log: (msg: string) => void,
): Promise<SendResult> {
  const withEmail = recipients.filter((g) => g.email);
  if (withEmail.length === 0)
    return { delivered: 0, failed: 0, skipped: 0, failedRecipients: [] };

  const messages = await Promise.all(withEmail.map((g) => buildInvitationEmail(event, g)));
  return sendMail(messages, log);
}

// Maps the addresses a send reported as failed back onto the guest rows it was
// given. Compared case-insensitively because the address that comes back is
// whatever the provider echoed, which is not reliably the casing we sent.
export function recipientsByAddress(recipients: Guest[], addresses: string[]): FailedGuest[] {
  if (addresses.length === 0) return [];
  const wanted = new Set(addresses.map((a) => a.toLowerCase()));
  return recipients
    .filter((g) => g.email && wanted.has(g.email.toLowerCase()))
    .map((g) => ({ id: g.id, name: g.name, email: g.email! }));
}

// Stamps invitedAt on exactly the guests mail reached.
//
// `invitedAt` answers "have we written to this person?", and until now it did
// not: the add-guests route set it at insert time from a `markInvited` flag,
// before any send was attempted, regardless of whether the event was a draft
// (which sends nothing) or the guest even had an address. A host reading their
// guest list saw "invited" beside people who had received nothing, which is
// worse than an empty column — and it makes the field useless as the "who
// still needs one?" filter that publishing now depends on.
export async function markDelivered(
  eventId: string,
  recipients: Guest[],
  failed: FailedGuest[],
): Promise<string[]> {
  const failedIds = new Set(failed.map((g) => g.id));
  const deliveredIds = recipients
    .filter((r) => r.email && !failedIds.has(r.id))
    .map((r) => r.id);

  if (deliveredIds.length > 0) {
    await db
      .update(guests)
      .set({ invitedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(guests.eventId, eventId), inArray(guests.id, deliveredIds)));
  }
  return deliveredIds;
}
