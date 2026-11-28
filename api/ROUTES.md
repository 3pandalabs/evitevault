# RsvpVault API routes

`H` = requires a host access token (`Authorization: Bearer <jwt>`).
`P` = public/anonymous — the event slug and the guest invite token are the only
credentials. See `CLAUDE.md` for the rules those routes must follow.

## Auth

| | Method | Path | Notes |
|---|---|---|---|
| P | POST | `/auth/register` | 409 on an existing address, deliberately indistinguishable from other failures |
| P | POST | `/auth/login` | → `accessToken` (15m) + `refreshToken` (30d) |
| P | POST | `/auth/refresh` | Rotates: the presented token is destroyed |
| P | POST | `/auth/logout` | Always 204 |
| P | POST | `/auth/forgot-password` | Always 204 — an unknown address must be indistinguishable from a known one |
| P | POST | `/auth/reset-password` | Single-use token, 30m TTL; revokes every session on success |
| H | GET | `/auth/me` | |
| H | DELETE | `/auth/sessions` | Revokes every session for the caller |

## Account

| | Method | Path | Notes |
|---|---|---|---|
| H | POST | `/me/delete` | `{ password }` re-confirmation (403 `wrong_password`; 5 tries / 15 min per account). Deletes the host, their events (guests, RSVPs, guestbook, announcements, views), host templates, sessions and reset tokens in one transaction; R2 objects under each `events/<id>/` are swept best-effort after commit |

## Contact

| | Method | Path | Notes |
|---|---|---|---|
| P | POST | `/contact` | `{ name, email, message, website? }` (`website` is a honeypot → silent 204). Relays one email to `SUPPORT_EMAIL` via the mailer gateway, Reply-To = sender; stores nothing. 5/hour per IP, 40/hour overall → 429; 503 `mailer_unavailable` if not delivered |

## Events (host hub)

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events` | List with RSVP tallies joined in — one round trip for the dashboard |
| H | POST | `/events` | Cover image is set afterwards by PATCH (the key needs the event id) |
| H | GET | `/events/:eventId` | |
| H | PATCH | `/events/:eventId` | Replacing the cover deletes the old R2 object |
| H | POST | `/events/:eventId/publish` | Rejects an event with no title/date |
| H | POST | `/events/:eventId/preview-link` | Signed, event-scoped, 2-hour token; `/e/:slug?p=…` then serves the draft as guests will see it |
| H | DELETE | `/events/:eventId` | Guests, guestbook, announcements and views cascade |
| H | GET | `/events/:eventId/analytics` | RSVP tally, views, unique visitors, views-by-day, response rate |
| H | GET | `/events/:eventId/guests.csv` | Formula-injection-safe, UTF-8 BOM for Excel |

## Guests / invitations

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/guests` | `?status=` filter |
| H | POST | `/events/:eventId/guests` | Single add and bulk import (≤500); duplicate emails skipped, never overwritten |
| H | PATCH | `/events/:eventId/guests/:guestId` | Host can record an RSVP received by phone/text |
| H | DELETE | `/events/:eventId/guests/:guestId` | |
| H | POST | `/events/:eventId/guests/:guestId/rotate-token` | For a personal link that leaked to a group chat |
| H | GET | `/events/:eventId/rsvp-log` | Append-only history of status changes |

## Guestbook moderation

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/guestbook` | Includes hidden posts |
| H | PATCH | `/events/:eventId/guestbook/:postId` | `{ status: visible \| hidden }` |
| H | DELETE | `/events/:eventId/guestbook/:postId` | Also deletes the R2 object |

## Announcements

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/announcements` | |
| H | POST | `/events/:eventId/announcements` | Audience: all/attending/pending/maybe/declined. Row is written before the send so a partial delivery is still visible |
| H | POST | `/events/:eventId/photo-album/share` | Mails `events.photo_album_url` as a button; 409 `no_photo_album` if unset. Records an announcement row like any other broadcast |

## Templates

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/templates` | System templates + the caller's own |
| H | POST | `/templates` | Saved as a host template; key is namespaced by user id |
| H | DELETE | `/templates/:templateId` | System templates can't be deleted (predicate requires `created_by = caller`) |

## Storage (R2 presigned URLs)

| | Method | Path | Notes |
|---|---|---|---|
| H | POST | `/events/:eventId/cover/presign-upload` | Key generated server-side; image content types only, pinned into the signature |
| H | POST | `/storage/presign-download` | Authorized by the key's `events/<id>/` prefix |
| P | POST | `/public/events/:slug/guestbook/presign-upload` | Only when the event allows guest photos |

## Video invites (404 unless `VIDEO_INVITES=on`, or `=admins` and the caller is a real admin / an admin's test host)

`/auth/me` returns `features.videoInvites` (the same decision, made on the server).

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/video-invite` | `available`, per-tier `tiers` (Simple: ffmpeg; Pro: Google/fal; paid tiers also need Stripe), prices (Simple may be 0 = free), occasions, `lineMax`, `freePerDay`, script cap, the event's latest order (`state`: paying/making/ready/failed, `lines` for Simple) with a presigned `videoUrl` when ready |
| H | POST | `/events/:eventId/video-invite/photo/presign-upload` | Pro photo, key `events/<id>/video-photo/<uuid>` |
| H | POST | `/events/:eventId/video-invite/checkout` | Simple: `{tier:"simple", occasion, lines:{kicker, headline, when, where}, variant?: 1-5, narration?: string}` (narration: same rules as a Pro script, 400 `narration_too_short/too_long/has_link`; empty = music only); Pro: `{tier:"pro", occasion, script, photoKey, attested:true}`. Paid → `{checkoutUrl}` (order `pending_payment`, nothing generated until the webhook). Free Simple (price 0) → `{queued:true}` (order `paid` at once; 429 `free_daily_limit` after 5 per host per UTC day). 400 `headline_required` / `line_too_long` / `line_has_link` / `script_*` / `photo_required` / `attestation_required`, 409 `video_invite_in_progress`, 503 `video_invites_unavailable` |
| P | POST | `/webhooks/stripe` | Signature over the raw body. Ignores anything not `metadata.app=rsvpvault, kind=video_invite`. Paid session → order `paid` (amount checked); expired → `cancelled` |

## Admin tools (requireRealAdmin: role re-read from the DB; 403 inside a test host)

| | Method | Path | Notes |
|---|---|---|---|
| H | PATCH | `/auth/me/test-mode` | `{on}` → admin "Test as host" (403 non-admin / test host). `/auth/me` returns `testAsHost`, `testHost`, `testMode`, `isInternal`, `internalLabel`; `role` stays the REAL role |
| A | GET | `/admin/overview` | Counts: real hosts (excl. admins, test hosts, internal, marked test), events, guests, greetings, video orders, refund queue, real revenue |
| A | GET | `/admin/users?q=` | Up to 200, newest first; flags, events/greetings counts |
| A | POST | `/admin/users/:id/flags` | `{isInternal?, internalLabel?, markedTest?}`. 409 `cannot_mark_test` (admins, test hosts) / `cannot_mark_internal` (test hosts). Changes no price, gate or email |
| A | GET | `/admin/events?q=` | Up to 200; `hostTest` = ours |
| A | GET | `/admin/video-invites?refundNeeded=1` | Orders, refund queue first |
| A | POST | `/admin/video-invites/:id/refunded` | `failed` → `refunded` after the Stripe refund; 409 `not_failed` |
| H | GET/POST | `/test-hosts` | Real admin (or from inside one of their test hosts): list / create (`{name}`, max 50). *.invalid email, random password |
| H | POST | `/test-hosts/:id/switch` | `{refreshToken?}` → a new token pair for the test host (old session ended). 404 unless the caller's admin owns it |
| H | POST | `/test-hosts/back` | Only from a session carrying the `testOwner` claim, re-checked against `users.test_owner_id` → the admin's token pair |

`A` = admin only. `/auth/login` refuses test hosts (401); `/auth/forgot-password` sends nothing to a *.invalid address.

## Cash gifts (404 unless `CASH_GIFTS=on`, or `=admins` and the caller is a real admin / an admin's test host)

Stripe mode: TEST for everyone unless `GIFTS_STRIPE_MODE=live`; then live for real hosts and still TEST for an admin testing as host or a test host (409 `gifts_test_unavailable` when no test key). `/auth/me` returns `features.cashGifts`.

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/gifts/account` | `{mode, status: none/needs_info/pending/ready, available, reason?}`; refreshes the status from Stripe when an account exists |
| H | POST | `/gifts/account/onboard` | `{eventId}` → `{url}`: creates the Express account if needed (Accounts v2 by default: US individual, recipient + `stripe_transfers`, Express dashboard, platform fee/loss collector; then a v1 update sets the 7-day payout delay. `GIFTS_STRIPE_ACCOUNTS_API=v1` uses the old v1 Express form) and a Stripe-hosted Account Link back to the event page (`?gifts=return` / `?gifts=refresh`) |
| H | POST | `/gifts/account/dashboard` | `{url}`: one-time Express dashboard login link. 409 `no_account` |
| H | GET | `/events/:eventId/gifts` | Settings (`enabled`, `suggestedCents`, `message`), limits, fee rates, `receivedCents`, the gifts (name, amount, message, status). Host only |
| H | PATCH | `/events/:eventId/gifts` | `{enabled?, suggestedCents?, message?}`. Enabling needs a `ready` account: 409 `gifts_account_not_ready` |
| P | POST | `/public/events/:slug/gift` | `{amountCents, name?, message?}` → `{checkoutUrl, breakdown}`. Published events with gifts on and a ready host only (404 `gifts_not_available`). 400 `amount_too_small/large`, 429 `event_daily_cap` / `event_cap` / `too_many_requests` (10/hour per IP). Destination charge to the host, `application_fee_amount` = our cut + card fee |
| A | GET | `/admin/gifts` | Disputed first |

On the first paid delivery (the conditional `pending -> paid` UPDATE) the webhook emails the host "You got a gift" and the guest a receipt (address from Checkout `customer_details.email`, stored in `gifts.guest_email`). Retries send nothing. A paid event whose `livemode` doesn't match the gift's mode is refused (`mode mismatch`); only a FULL `charge.refunded` marks a gift refunded.

`toPublicEvent().gifts` = `{suggestedCents, message, minCents, maxCents, fees, testMode}` or null; never amounts given. `/me/delete` answers 409 `recent_gifts` while the host has a live gift paid in the last 120 days or one disputed.

### Stripe webhook endpoints (all to `POST /webhooks/stripe`)

| Endpoint (Stripe dashboard) | Events | Secret env |
|---|---|---|
| Platform, live ("Your account") | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` | `STRIPE_WEBHOOK_SECRET` |
| Connect, live ("Connected accounts") | `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Platform, test | same as platform live | `STRIPE_TEST_WEBHOOK_SECRET` |
| Connect, test | `account.updated` | `STRIPE_TEST_CONNECT_WEBHOOK_SECRET` |

Any configured secret that verifies the signature is accepted; events not tagged rsvpvault are answered 200 and ignored.

## Free host features (migration 0015; `routes/extras.ts` host, `routes/publicExtras.ts` guest)

Host routes accept the event **owner or an accepted co-host** (`lib/eventAccess.ts` `loadManagedEvent`; permissions in
`lib/features/cohosts.ts`). Since 0015 the Events, Guests, Guestbook moderation, Announcements and Storage routes above
do too, except `DELETE /events/:eventId` (owner only). Video invites and cash gifts stay owner only. Guest writes need
the guest's own invite token. All guest email goes through `sendGuestMail` (test-mode guard, daily quota).

| | Method | Path | Notes |
|---|---|---|---|
| H | PATCH | `/events/:eventId` | New fields: `remindersEnabled`, `reminderIncludeMaybe`, `registryLinks` (≤5 `{label,url}`), `playlistUrl`, `chipIn` `{venmo,cashapp,paypal}` (handles normalised; bad → 400), `approvalRequired`, `waitlistEnabled`, `potluckEnabled`, `albumEnabled`, `albumGuestUploads` |
| H | POST | `/events/:eventId/guests/:guestId/approve` | Waitlisted → attending, one email (quota-aware: `quotaExhausted`, `emailed`, `testNotSent`). 409 `not_waitlisted` |
| H | POST | `/events/:eventId/guests/:guestId/decline` | Waitlisted → declined; no email; the guest can't re-request (`request_declined`) |
| H | PUT | `/events/:eventId/questions` | `{ questions: [{id,type:text\|choice\|yesno,label,options?,required}] }` ≤10; answers appear in the guest list and as CSV columns |
| H | GET | `/events/:eventId/cohosts` | `myRole`; owner also sees pending accept links |
| H | POST | `/events/:eventId/cohosts` | Owner only. `{name,email}`; ≤5; emails the invite (link also returned) |
| H | DELETE | `/events/:eventId/cohosts/:cohostId` | Owner removes anyone; a co-host can remove themselves |
| H | GET | `/cohost-invites/:token` | Signed-in preview of an invite (`problem`: `email_mismatch` / `owner_cannot_cohost` / `already_accepted`) |
| H | POST | `/cohost-invites/:token/accept` | Only an account whose email is the invited one |
| H | GET / POST | `/events/:eventId/potluck`, `/events/:eventId/potluck/items` | Items `{name,note?,quantity 1..100}` ≤50, with claims (guest names) |
| H | PATCH / DELETE | `/events/:eventId/potluck/items/:itemId` | |
| H | GET / PUT / DELETE | `/events/:eventId/poll` | PUT `{options:[{startsAt,endsAt?}]}` 2..5 future, distinct; opens the poll. DELETE removes it |
| H | POST | `/events/:eventId/poll/pick` | `{optionId, notify}` sets the event date, closes the poll once, ONE email to guests already invited / replied / voted (never decliners) |
| H | GET | `/events/:eventId/album` | Photos (presigned), flags, cap |
| H | POST | `/events/:eventId/album/presign` | `{contentType,size}`; Content-Length signed into the PUT; 200 photos, 10 MB, jpeg/png/webp |
| H | POST | `/events/:eventId/album/photos` | `{key}`; HEAD-checks size/type before the row is written |
| H | DELETE | `/events/:eventId/album/photos/:photoId` | Deletes the R2 object too |
| H | GET | `/events/:eventId/album.zip` | "Download all": STORE zip streamed one photo at a time |
| P | POST | `/public/events/:slug/potluck/:itemId/claim` | `{token, quantity}` (0 releases); row-locked, 409 `not_enough_left` |
| P | POST | `/public/events/:slug/poll/vote` | `{token, votes:[{optionId, answer:yes\|maybe\|no}]}` |
| P | GET | `/public/events/:slug/album` | Published + album on; `?t=` marks the caller's own photos; first names only |
| P | POST | `/public/events/:slug/album/presign` | Token required, guest uploads on, same caps |
| P | POST | `/public/events/:slug/album/photos` | `{token,key}` |
| P | DELETE | `/public/events/:slug/album/photos/:photoId` | `?t=`; own photos only |

`GET /public/events/:slug` gains `calendar.outlookUrl` and `extras` (`publicExtras()`): co-host first names, registry,
playlist, chip-in deep links, questions, waitlist/approval mode, potluck, open poll, album summary, and the caller's own
answers / waitlist state. `POST /public/events/:slug/rsvp` accepts `answers` and may answer `status: "waitlisted"` with
`waitlistReason` (`capacity` | `approval`); errors `request_declined`, `answer_required`, `invalid_answer`.

Day-before reminder: `jobs/reminders.ts`, hourly, events starting 2–30 h ahead with reminders on, guests going (and maybe
if ticked) with an email and `reminder_sent_at` null; marked from the send result; stops at `quota_exceeded`.

## Public invitation

| | Method | Path | Notes |
|---|---|---|---|
| P | GET | `/public/events/:slug` | `?t=<inviteToken>` personalises. Published events only; records a view (deduped hourly) |
| P | POST | `/public/events/:slug/rsvp` | Token → updates that guest. No token → creates one, but only if the event allows public RSVP, and never over an existing invitee's email |
| P | GET | `/public/events/:slug/calendar.ics` | RFC 5545, CRLF + folded (Outlook rejects LF) |
| P | GET | `/public/events/:slug/guestbook` | Visible posts only, with presigned photo URLs |
| P | POST | `/public/events/:slug/guestbook` | Image key must be under this event's guestbook prefix |

## Ops

| | Method | Path | Notes |
|---|---|---|---|
| P | GET | `/health` | |
| — | GET | `/metrics` | Bearer `METRICS_TOKEN`; 503 when unconfigured so a missing ops secret can't fail a deploy |
