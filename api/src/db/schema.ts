import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enum-ish columns are `text` + a CHECK constraint rather than pgEnum, matching
// the RentVault schema. Adding a value to a pgEnum needs its own migration and
// can't run inside a transaction with other DDL; a CHECK is a one-line ALTER.

// ---------------------------------------------------------------------------
// Identity — hosts/organizers only. Guests are never users: they are rows in
// `guests`, authenticated (such as it is) by an unguessable invite token.
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    // "admin" sees the internal ops dashboard (all events, platform analytics);
    // "host" only ever sees their own rows.
    role: text("role").notNull().default("host"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('host','admin')`)],
);

// Revocable refresh tokens. Only the bcrypt hash is stored, so a DB leak alone
// doesn't yield usable tokens. Token format is `${sessionId}.${secret}` — see
// auth/jwt.ts for why the id is carried in the token.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Templates — the preset invitation designs a host starts from.
// ---------------------------------------------------------------------------

// `theme` shape (validated by lib/theme.ts, stored as jsonb so a new design
// knob doesn't need a migration):
//   { palette: { bg, surface, text, muted, accent, accentText },
//     fonts:   { heading, body },
//     layout:  "classic" | "poster" | "minimal" | "photo" }
export const eventTemplates = pgTable(
  "event_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stable human key ("garden-party") used by seeds and the web picker, so
    // re-seeding is idempotent and templates can be referenced in code.
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("general"),
    theme: jsonb("theme").notNull(),
    previewImageKey: text("preview_image_key"),
    // System templates ship with the product and are visible to every host.
    // A host-authored template (createdBy set) is visible only to its author.
    isSystem: boolean("is_system").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_event_templates_created_by").on(t.createdBy),
    check(
      "event_templates_ownership_check",
      sql`(${t.isSystem} and ${t.createdBy} is null) or (not ${t.isSystem} and ${t.createdBy} is not null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // PUBLIC identifier, used in /e/:slug. Defaults to a random UUID rendered
    // as text: unguessable, so possession of the link is what grants access.
    // A host may set a custom slug, but the CHECK below keeps it long enough
    // that the URL space stays impractical to enumerate. Never derive this
    // from the title — a guessable slug leaks every unlisted invitation.
    slug: text("slug")
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()::text`),

    title: text("title").notNull(),
    description: text("description"),
    hostDisplayName: text("host_display_name"),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    // IANA zone (e.g. "Asia/Kolkata"). Stored alongside the absolute timestamps
    // because an invitation must render in the event's local time for every
    // guest, not in each guest's browser zone.
    timezone: text("timezone").notNull().default("UTC"),

    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationMapUrl: text("location_map_url"),

    coverImageKey: text("cover_image_key"),
    templateId: uuid("template_id").references(() => eventTemplates.id, { onDelete: "set null" }),
    // Per-event overrides merged over the template's theme. Same shape,
    // every key optional.
    themeOverrides: jsonb("theme_overrides"),

    status: text("status").notNull().default("draft"),

    // RSVP configuration
    rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
    allowPlusOnes: boolean("allow_plus_ones").notNull().default(true),
    maxPlusOnes: integer("max_plus_ones").notNull().default(2),
    capacity: integer("capacity"),
    collectDietary: boolean("collect_dietary").notNull().default(false),
    // Open RSVP: anyone holding the slug may respond, creating a guest row.
    // Off means only holders of an invite token can respond.
    allowPublicRsvp: boolean("allow_public_rsvp").notNull().default(true),

    // Guest-facing feature switches
    guestbookEnabled: boolean("guestbook_enabled").notNull().default(true),
    guestPhotosEnabled: boolean("guest_photos_enabled").notNull().default(true),
    // Whether the public page lists who else is attending.
    showGuestList: boolean("show_guest_list").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_events_host").on(t.hostId),
    index("idx_events_starts_at").on(t.startsAt),
    check("events_status_check", sql`${t.status} in ('draft','published','cancelled','archived')`),
    check("events_slug_length_check", sql`length(${t.slug}) >= 12`),
    check("events_max_plus_ones_check", sql`${t.maxPlusOnes} >= 0`),
    check("events_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
    check("events_ends_after_starts_check", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
  ],
);

// ---------------------------------------------------------------------------
// Guests (invitations). One row per invited person per event; also the RSVP
// record, because a guest has exactly one current response and history lives
// in `rsvp_log`.
// ---------------------------------------------------------------------------

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    // The guest's personal credential: /e/:slug?t=:inviteToken. Possession
    // proves nothing about identity, only that the host sent them the link —
    // which is exactly the trust level a paper invitation carries.
    inviteToken: uuid("invite_token").notNull().unique().defaultRandom(),

    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),

    rsvpStatus: text("rsvp_status").notNull().default("pending"),
    // Additional people the guest is bringing; total headcount is 1 + plusOnes
    // when attending. Kept separate from a "party size" so the host can see who
    // the named invitee is versus how many they added.
    plusOnes: integer("plus_ones").notNull().default(0),
    // Names of those additional people, in order. jsonb rather than its own
    // table: they are not invitees in their own right — no invite token, no
    // RSVP, no login — so a row per person would imply a lifecycle they don't
    // have. A host needs them for place cards and a door list, nothing more.
    // May be shorter than plusOnes when a guest doesn't know yet who they're
    // bringing; the count is authoritative for headcount, not the array length.
    plusOneNames: jsonb("plus_one_names").$type<string[]>(),
    dietaryNotes: text("dietary_notes"),
    // Free-text message from guest to host, shown in the RSVP list, not public.
    message: text("message"),

    // How this guest came to exist: "invited" (host added them),
    // "public" (self-registered through an open RSVP link).
    source: text("source").notNull().default("invited"),

    invitedAt: timestamp("invited_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_guests_event").on(t.eventId),
    index("idx_guests_event_status").on(t.eventId, t.rsvpStatus),
    // One invitation per email per event. Partial so multiple email-less
    // guests (name-only, invited by hand) can coexist. lower() so
    // "A@b.com" can't be added twice — enforced in the DB rather than only in
    // the route, since bulk import and single-add are separate code paths.
    uniqueIndex("uq_guests_event_email")
      .on(t.eventId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    check("guests_rsvp_status_check", sql`${t.rsvpStatus} in ('pending','attending','declined','maybe')`),
    check("guests_source_check", sql`${t.source} in ('invited','public')`),
    check("guests_plus_ones_check", sql`${t.plusOnes} >= 0`),
  ],
);

// Append-only audit of RSVP changes. A guest who flips attending → declined the
// night before matters to a host planning catering, and the current-state
// column alone can't tell them that happened.
export const rsvpLog = pgTable(
  "rsvp_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status"),
    newStatus: text("new_status").notNull(),
    plusOnes: integer("plus_ones").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_rsvp_log_event").on(t.eventId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Guestbook — the public comment/photo wall on an invitation.
// ---------------------------------------------------------------------------

export const guestbookPosts = pgTable(
  "guestbook_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // Null when an anonymous visitor posted through an open RSVP event.
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    // Denormalised so a post keeps its byline if the guest row is deleted.
    authorName: text("author_name").notNull(),
    body: text("body"),
    // R2 object key for an attached photo — never a URL. The API mints a
    // short-lived presigned GET when rendering, so an object can't be hotlinked
    // or survive the post being hidden.
    imageKey: text("image_key"),
    // Hosts moderate rather than delete, so a hidden post can be restored and
    // the guest isn't told their message vanished.
    status: text("status").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_guestbook_event").on(t.eventId, t.createdAt),
    check("guestbook_posts_status_check", sql`${t.status} in ('visible','hidden')`),
    // A post with neither text nor a photo is noise.
    check(
      "guestbook_posts_content_check",
      sql`${t.body} is not null or ${t.imageKey} is not null`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Announcements — host-to-guest broadcasts after the invitation goes out.
// ---------------------------------------------------------------------------

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // Which slice of the guest list it went to, so "resend to no-shows" is
    // reconstructable later.
    audience: text("audience").notNull().default("all"),
    recipientCount: integer("recipient_count").notNull().default(0),
    // Null until the send actually completes; a row exists first so a partial
    // send is visible rather than silently lost.
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_announcements_event").on(t.eventId, t.createdAt),
    check(
      "announcements_audience_check",
      sql`${t.audience} in ('all','attending','pending','maybe','declined')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Analytics — invitation page views, for the host's "X views, Y% responded".
// ---------------------------------------------------------------------------

// One row per view, not a counter, so the dashboard can chart views over time
// and distinguish "150 views from 12 people" from "150 people looked once".
// No IP or user agent is stored: `visitorHash` is a salted hash of IP + UA,
// which is enough to dedupe a refresh without retaining anything identifying.
export const eventViews = pgTable(
  "event_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    visitorHash: text("visitor_hash").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    // viewedAt truncated to the hour, written by the app rather than computed
    // in the index: date_trunc() over timestamptz depends on the session
    // TimeZone, so it is STABLE, not IMMUTABLE, and Postgres refuses it in an
    // index expression. The unique below then collapses a refresh-happy
    // visitor into one row per hour (insert uses onConflictDoNothing).
    viewedHour: timestamp("viewed_hour", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_event_views_event").on(t.eventId, t.viewedAt),
    unique("uq_event_views_hourly").on(t.eventId, t.visitorHash, t.viewedHour),
  ],
);

export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type GuestbookPost = typeof guestbookPosts.$inferSelect;
export type EventTemplate = typeof eventTemplates.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
