import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalProblem, decideRsvp, overCapacity, type RsvpRuleInput } from "./rsvpRules.js";
import {
  eventWantsReminders,
  guestNeedsReminder,
  mapLinkFor,
  reminderWindow,
  selectReminderRecipients,
  type ReminderEvent,
} from "./reminders.js";
import { leader, optionsProblem, shouldNotifyOfDate, tallyPoll } from "./poll.js";
import { claimProblem, claimerLabel, remaining } from "./potluck.js";
import { answerColumns, cleanAnswers, parseQuestions, questionsSchema } from "./questions.js";
import { chipInLinks, chipInSchema, normaliseHandle, playlistService, publicRegistry } from "./links.js";
import { acceptProblem, canPerform, publicCohostNames } from "./cohosts.js";
import { ALBUM_MAX_BYTES, ALBUM_MAX_PHOTOS, albumVisible, canRemovePhoto, isAlbumKeyFor, uploadProblem } from "./album.js";

// --- waitlist / approval -----------------------------------------------------

const base: RsvpRuleInput = {
  requested: "attending",
  approvalRequired: false,
  waitlistEnabled: true,
  capacity: null,
  headcount: 0,
  alreadyCounted: 0,
  partySize: 1,
  approvalStatus: null,
};

test("a plain going with room is attending", () => {
  assert.deepEqual(decideRsvp(base), { ok: true, status: "attending", approvalStatus: null, waitlistReason: null });
});

test("at capacity: waitlist when enabled, refusal when not", () => {
  const full = { ...base, capacity: 10, headcount: 10 };
  assert.deepEqual(decideRsvp(full), { ok: true, status: "waitlisted", approvalStatus: "pending", waitlistReason: "capacity" });
  assert.deepEqual(decideRsvp({ ...full, waitlistEnabled: false }), { ok: false, error: "at_capacity" });
});

test("capacity counts the party and excludes the guest's own current party", () => {
  assert.equal(overCapacity(10, 8, 0, 3), true);
  assert.equal(overCapacity(10, 8, 0, 2), false);
  // Already attending with 2, changing to 3: 8 - 2 + 3 = 9 fits.
  assert.equal(overCapacity(10, 8, 2, 3), false);
  assert.equal(overCapacity(null, 1000, 0, 5), false);
});

test("approval mode waitlists every going until approved", () => {
  const r = decideRsvp({ ...base, approvalRequired: true });
  assert.deepEqual(r, { ok: true, status: "waitlisted", approvalStatus: "pending", waitlistReason: "approval" });
  const approved = decideRsvp({ ...base, approvalRequired: true, approvalStatus: "approved" });
  assert.equal(approved.ok && approved.status, "attending");
});

test("an approved guest still waits if growing the party overflows capacity", () => {
  const r = decideRsvp({ ...base, approvalRequired: true, approvalStatus: "approved", capacity: 5, headcount: 5, alreadyCounted: 1, partySize: 3 });
  assert.equal(r.ok && r.status, "waitlisted");
});

test("a declined request cannot be re-sent, but maybe/decline always work", () => {
  assert.deepEqual(decideRsvp({ ...base, approvalStatus: "declined" }), { ok: false, error: "request_declined" });
  const m = decideRsvp({ ...base, requested: "maybe", approvalStatus: "declined", capacity: 1, headcount: 1 });
  assert.equal(m.ok && m.status, "maybe");
  // Leaving the waitlist clears the pending request.
  const d = decideRsvp({ ...base, requested: "declined", approvalStatus: "pending" });
  assert.equal(d.ok && d.approvalStatus, null);
});

test("only a pending waitlisted guest can be approved or declined", () => {
  assert.equal(approvalProblem({ rsvpStatus: "waitlisted", approvalStatus: "pending" }), null);
  assert.equal(approvalProblem({ rsvpStatus: "attending", approvalStatus: "approved" }), "not_waitlisted");
  assert.equal(approvalProblem({ rsvpStatus: "waitlisted", approvalStatus: null }), "not_waitlisted");
});

// --- reminders -----------------------------------------------------------------

const now = new Date("2026-12-01T12:00:00Z");
const tomorrow = new Date("2026-12-02T12:00:00Z");
const ev: ReminderEvent = { status: "published", remindersEnabled: true, reminderIncludeMaybe: false, startsAt: tomorrow };

test("reminder window is 2h..30h ahead", () => {
  const w = reminderWindow(now);
  assert.equal(w.from.toISOString(), "2026-12-01T14:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-12-02T18:00:00.000Z");
  assert.equal(eventWantsReminders(ev, now), true);
  assert.equal(eventWantsReminders({ ...ev, startsAt: new Date("2026-12-01T13:00:00Z") }, now), false);
  assert.equal(eventWantsReminders({ ...ev, startsAt: new Date("2026-12-03T12:00:00Z") }, now), false);
  assert.equal(eventWantsReminders({ ...ev, remindersEnabled: false }, now), false);
  assert.equal(eventWantsReminders({ ...ev, status: "draft" }, now), false);
});

test("only yes (and maybe when ticked), with an email, never twice", () => {
  const g = { email: "a@x.com", rsvpStatus: "attending", reminderSentAt: null };
  assert.equal(guestNeedsReminder(ev, g), true);
  assert.equal(guestNeedsReminder(ev, { ...g, reminderSentAt: now }), false);
  assert.equal(guestNeedsReminder(ev, { ...g, email: null }), false);
  assert.equal(guestNeedsReminder(ev, { ...g, rsvpStatus: "maybe" }), false);
  assert.equal(guestNeedsReminder({ ...ev, reminderIncludeMaybe: true }, { ...g, rsvpStatus: "maybe" }), true);
  for (const s of ["pending", "declined", "waitlisted"]) {
    assert.equal(guestNeedsReminder({ ...ev, reminderIncludeMaybe: true }, { ...g, rsvpStatus: s }), false, s);
  }
});

test("recipients are deduped by address, case-insensitively", () => {
  const list = [
    { id: 1, email: "A@x.com", rsvpStatus: "attending", reminderSentAt: null },
    { id: 2, email: "a@x.com ", rsvpStatus: "attending", reminderSentAt: null },
    { id: 3, email: "b@x.com", rsvpStatus: "attending", reminderSentAt: now },
    { id: 4, email: "c@x.com", rsvpStatus: "pending", reminderSentAt: null },
  ];
  assert.deepEqual(selectReminderRecipients(ev, list).map((g) => g.id), [1]);
});

test("map link falls back to a maps search for the address", () => {
  assert.equal(mapLinkFor({ locationMapUrl: "https://m.example/x", locationName: null, locationAddress: null }), "https://m.example/x");
  assert.equal(
    mapLinkFor({ locationMapUrl: null, locationName: "Hall", locationAddress: "1 Main St" }),
    "https://www.google.com/maps/search/?api=1&query=Hall%2C%201%20Main%20St",
  );
  assert.equal(mapLinkFor({ locationMapUrl: null, locationName: null, locationAddress: null }), null);
});

// --- date poll -------------------------------------------------------------------

test("tally scores yes 2 / maybe 1 and breaks ties by yes, then earliest", () => {
  const opts = [
    { id: "a", startsAt: new Date("2026-12-10T18:00:00Z") },
    { id: "b", startsAt: new Date("2026-12-09T18:00:00Z") },
    { id: "c", startsAt: new Date("2026-12-11T18:00:00Z") },
  ];
  const votes = [
    { optionId: "a", answer: "yes" },
    { optionId: "a", answer: "no" },
    { optionId: "b", answer: "maybe" },
    { optionId: "b", answer: "maybe" },
    { optionId: "c", answer: "yes" },
    { optionId: "zz", answer: "yes" }, // unknown option ignored
  ];
  const t = tallyPoll(opts, votes);
  // a=2 (1 yes), c=2 (1 yes), b=2 (0 yes): a before c by date, b last by fewer yes.
  assert.deepEqual(t.map((x) => x.optionId), ["a", "c", "b"]);
  assert.deepEqual(t[0], { optionId: "a", yes: 1, maybe: 0, no: 1, score: 2 });
  assert.equal(leader(t), "a");
  assert.equal(leader(tallyPoll(opts, [])), null);
});

test("poll options: 2..5, future, distinct, ends after starts", () => {
  const d = (s: string) => new Date(s);
  const f1 = { startsAt: d("2026-12-10T18:00:00Z") };
  const f2 = { startsAt: d("2026-12-11T18:00:00Z") };
  assert.equal(optionsProblem([f1, f2], now), null);
  assert.equal(optionsProblem([f1], now), "too_few_options");
  assert.equal(optionsProblem([f1, f2, f1, f2, f1, f2].map((o, i) => ({ startsAt: new Date(o.startsAt.getTime() + i * 1000) })), now), "too_many_options");
  assert.equal(optionsProblem([f1, { startsAt: d("2026-11-01T00:00:00Z") }], now), "option_in_past");
  assert.equal(optionsProblem([f1, { ...f1 }], now), "duplicate_option");
  assert.equal(optionsProblem([f1, { startsAt: f2.startsAt, endsAt: d("2026-12-11T17:00:00Z") }], now), "ends_before_starts");
});

test("date notice goes only to people already in contact, never decliners", () => {
  const g = { email: "a@x.com", invitedAt: null, respondedAt: null, rsvpStatus: "pending" };
  assert.equal(shouldNotifyOfDate(g, false), false);
  assert.equal(shouldNotifyOfDate(g, true), true);
  assert.equal(shouldNotifyOfDate({ ...g, invitedAt: now }, false), true);
  assert.equal(shouldNotifyOfDate({ ...g, invitedAt: now, rsvpStatus: "declined" }, true), false);
  assert.equal(shouldNotifyOfDate({ ...g, email: null, invitedAt: now }, true), false);
});

// --- potluck ---------------------------------------------------------------------

test("potluck claims cannot exceed what is left; releasing always works", () => {
  assert.equal(remaining(3, 1), 2);
  assert.equal(remaining(3, 5), 0);
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 1, mine: 0, wanted: 2 }), null);
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 2, mine: 0, wanted: 2 }), "not_enough_left");
  // Raising my own claim counts only the others' claims.
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 3, mine: 1, wanted: 2 }), "not_enough_left");
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 2, mine: 1, wanted: 2 }), null);
  // Host lowered the quantity under existing claims: reducing is still fine.
  assert.equal(claimProblem({ itemQuantity: 1, totalClaimed: 3, mine: 2, wanted: 1 }), null);
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 0, mine: 0, wanted: -1 }), "invalid_quantity");
  assert.equal(claimProblem({ itemQuantity: 3, totalClaimed: 0, mine: 0, wanted: 1.5 }), "invalid_quantity");
  assert.equal(claimerLabel("  Meera Iyer "), "Meera");
});

// --- custom questions --------------------------------------------------------------

const qs = parseQuestions([
  { id: "meal01", type: "choice", label: "Meal", options: ["Chicken", "Veg"], required: true },
  { id: "song01", type: "text", label: "Song request" },
  { id: "park01", type: "yesno", label: "Need parking?" },
]);

test("question schema rejects duplicates and single-option choices", () => {
  assert.equal(qs.length, 3);
  assert.equal(questionsSchema.safeParse([{ id: "aaaa", type: "text", label: "x" }, { id: "aaaa", type: "text", label: "y" }]).success, false);
  assert.equal(questionsSchema.safeParse([{ id: "aaaa", type: "choice", label: "x", options: ["one"] }]).success, false);
  assert.deepEqual(parseQuestions("garbage"), []);
});

test("answers: required only when going, choices validated, unknown ids dropped", () => {
  assert.deepEqual(cleanAnswers(qs, {}, true), { ok: false, error: "answer_required", questionId: "meal01" });
  assert.deepEqual(cleanAnswers(qs, {}, false), { ok: true, answers: {} });
  assert.deepEqual(cleanAnswers(qs, { meal01: "Fish" }, true), { ok: false, error: "invalid_answer", questionId: "meal01" });
  assert.deepEqual(cleanAnswers(qs, { meal01: "Veg", park01: "maybe" }, true), { ok: false, error: "invalid_answer", questionId: "park01" });
  const r = cleanAnswers(qs, { meal01: "Veg", song01: "  Dancing Queen ", park01: "yes", bogus: "x" }, true);
  assert.deepEqual(r, { ok: true, answers: { meal01: "Veg", song01: "Dancing Queen", park01: "yes" } });
  assert.deepEqual(answerColumns(qs, { meal01: "Veg" }), ["Veg", "", ""]);
});

// --- links / chip in ---------------------------------------------------------------

test("handles are normalised from what hosts paste", () => {
  assert.equal(normaliseHandle("venmo", "@Meera-Iyer"), "Meera-Iyer");
  assert.equal(normaliseHandle("venmo", "https://venmo.com/u/meera_99"), "meera_99");
  assert.equal(normaliseHandle("cashapp", "$meera"), "meera");
  assert.equal(normaliseHandle("cashapp", "https://cash.app/$meera"), "meera");
  assert.equal(normaliseHandle("paypal", "paypal.me/MeeraI"), "MeeraI");
  assert.equal(normaliseHandle("paypal", "javascript:alert(1)"), null);
  assert.equal(normaliseHandle("venmo", "abc"), null);
});

test("chip-in deep links", () => {
  assert.deepEqual(chipInLinks({ venmo: "meera99", cashapp: "meera", paypal: "MeeraI" }).map((l) => l.url), [
    "https://venmo.com/u/meera99",
    "https://cash.app/$meera",
    "https://paypal.me/MeeraI",
  ]);
  assert.deepEqual(chipInLinks(null), []);
  assert.equal(chipInSchema.safeParse({ venmo: "bad handle!" }).success, false);
  const ok = chipInSchema.parse({ venmo: "@meera99", cashapp: "", paypal: null });
  assert.deepEqual(ok, { venmo: "meera99", cashapp: null, paypal: null });
});

test("playlist service and registry labels", () => {
  assert.equal(playlistService("https://open.spotify.com/playlist/x"), "Spotify");
  assert.equal(playlistService("https://music.apple.com/us/playlist/x"), "Apple Music");
  assert.equal(playlistService("https://www.youtube.com/playlist?list=x"), "YouTube");
  assert.equal(playlistService("https://example.com/x"), "Playlist");
  assert.equal(playlistService(null), null);
  assert.deepEqual(publicRegistry([{ label: "", url: "https://www.amazon.com/wedding/x" }, { label: "Bad", url: "javascript:x" }]), [
    { label: "amazon.com", url: "https://www.amazon.com/wedding/x" },
  ]);
});

// --- co-hosts ------------------------------------------------------------------------

test("co-hosts manage but cannot delete, transfer, manage co-hosts or use paid features", () => {
  for (const a of ["view", "edit", "publish", "manage_guests", "send_mail", "manage_extras"] as const) {
    assert.equal(canPerform("cohost", a), true, a);
    assert.equal(canPerform("owner", a), true, a);
  }
  for (const a of ["delete_event", "transfer", "manage_cohosts", "paid_features"] as const) {
    assert.equal(canPerform("cohost", a), false, a);
    assert.equal(canPerform("owner", a), true, a);
  }
  assert.equal(canPerform(null, "view"), false);
});

test("co-host invitations are accepted only by the invited address", () => {
  const inv = { status: "invited", email: "Sam@x.com", eventHostId: "owner" };
  assert.equal(acceptProblem(inv, { id: "u2", email: "sam@x.com" }), null);
  assert.equal(acceptProblem(inv, { id: "u2", email: "other@x.com" }), "email_mismatch");
  assert.equal(acceptProblem(inv, { id: "owner", email: "sam@x.com" }), "owner_cannot_cohost");
  assert.equal(acceptProblem({ ...inv, status: "accepted" }, { id: "u2", email: "sam@x.com" }), "already_accepted");
  assert.deepEqual(publicCohostNames([{ name: "Sam Lee", status: "accepted" }, { name: "Pat", status: "invited" }]), ["Sam"]);
});

// --- album -------------------------------------------------------------------------------

const albumEv = { status: "published", albumEnabled: true, albumGuestUploads: true };
const up = { event: albumEv, uploader: "guest" as const, hasGuestToken: true, currentCount: 0, sizeBytes: 1000, contentType: "image/jpeg" };

test("album visible only on a published event with the album on", () => {
  assert.equal(albumVisible(albumEv), true);
  assert.equal(albumVisible({ ...albumEv, status: "draft" }), false);
  assert.equal(albumVisible({ ...albumEv, albumEnabled: false }), false);
});

test("album caps: count, size, type; guests need a token and permission", () => {
  assert.equal(uploadProblem(up), null);
  assert.equal(uploadProblem({ ...up, currentCount: ALBUM_MAX_PHOTOS }), "album_full");
  assert.equal(uploadProblem({ ...up, currentCount: ALBUM_MAX_PHOTOS - 1 }), null);
  assert.equal(uploadProblem({ ...up, sizeBytes: ALBUM_MAX_BYTES + 1 }), "too_large");
  assert.equal(uploadProblem({ ...up, sizeBytes: ALBUM_MAX_BYTES }), null);
  assert.equal(uploadProblem({ ...up, sizeBytes: 0 }), "too_large");
  assert.equal(uploadProblem({ ...up, contentType: "image/gif" }), "unsupported_content_type");
  assert.equal(uploadProblem({ ...up, contentType: "video/mp4" }), "unsupported_content_type");
  assert.equal(uploadProblem({ ...up, hasGuestToken: false }), "invitation_required");
  assert.equal(uploadProblem({ ...up, event: { ...albumEv, albumGuestUploads: false } }), "guest_uploads_off");
  assert.equal(uploadProblem({ ...up, event: { ...albumEv, status: "draft" } }), "album_disabled");
  // Hosts can fill the album before publishing, but not with it switched off.
  assert.equal(uploadProblem({ ...up, uploader: "host", hasGuestToken: false, event: { ...albumEv, status: "draft" } }), null);
  assert.equal(uploadProblem({ ...up, uploader: "host", event: { ...albumEv, albumEnabled: false } }), "album_disabled");
});

test("album keys are bound to the event's album prefix; removal rights", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(isAlbumKeyFor(id, `events/${id}/album/22222222-2222-2222-2222-222222222222.jpg`), true);
  assert.equal(isAlbumKeyFor(id, `events/${id}/guestbook/22222222-2222-2222-2222-222222222222.jpg`), false);
  assert.equal(isAlbumKeyFor(id, `events/33333333-3333-3333-3333-333333333333/album/22222222-2222-2222-2222-222222222222.jpg`), false);
  assert.equal(canRemovePhoto({ guestId: "g1" }, { kind: "manager" }), true);
  assert.equal(canRemovePhoto({ guestId: "g1" }, { kind: "guest", guestId: "g1" }), true);
  assert.equal(canRemovePhoto({ guestId: "g1" }, { kind: "guest", guestId: "g2" }), false);
  assert.equal(canRemovePhoto({ guestId: null }, { kind: "guest", guestId: "g2" }), false);
});
