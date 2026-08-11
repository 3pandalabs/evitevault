import crypto from "node:crypto";
import type { Event } from "../db/schema.js";

/**
 * A fingerprint of everything the exported card draws.
 *
 * The card image is flattened at export time and then never touched again, so
 * it goes stale the moment the event changes underneath it — and silently,
 * because the invitation page renders live and looks fine while the image
 * forwarded to two hundred people still shows last month's date.
 *
 * `updated_at` can't answer "is the card stale?": it moves when the host
 * changes the RSVP capacity or toggles the guestbook, neither of which the card
 * renders. A banner driven off that would cry wolf until it was ignored, which
 * is worse than no banner. Hashing exactly the fields the card draws means it
 * fires when, and only when, the picture is actually wrong.
 *
 * Keep this in step with what web/src/lib/card/render.ts reads. A field the
 * card starts drawing but this doesn't hash is a stale card nobody is warned
 * about; the reverse is only a spurious warning.
 */
export function cardSourceHash(event: {
  title: Event["title"];
  description: Event["description"];
  hostDisplayName: Event["hostDisplayName"];
  startsAt: Event["startsAt"];
  endsAt: Event["endsAt"];
  timezone: Event["timezone"];
  locationName: Event["locationName"];
  slug: Event["slug"];
  coverImageKey: Event["coverImageKey"];
  templateId: Event["templateId"];
  themeOverrides: Event["themeOverrides"];
}): string {
  // Dates normalised to ISO because a Date from the DB and a Date coerced from
  // a request body stringify differently, which would make every save look like
  // a change.
  const source = JSON.stringify([
    event.title,
    event.description,
    event.hostDisplayName,
    event.startsAt instanceof Date ? event.startsAt.toISOString() : event.startsAt,
    event.endsAt instanceof Date ? event.endsAt.toISOString() : event.endsAt,
    event.timezone,
    event.locationName,
    // The slug is printed on the card and encoded in the QR, so a custom slug
    // set after export invalidates the image as surely as a new date.
    event.slug,
    event.coverImageKey,
    // The template supplies the palette, fonts and artwork the card is drawn
    // in; switching it on the event form changes the picture without touching
    // any of the text.
    event.templateId,
    event.themeOverrides ?? null,
  ]);

  return crypto.createHash("sha256").update(source).digest("hex");
}
