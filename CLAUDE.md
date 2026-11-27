# RsvpVault — repo conventions

Digital invitation + event management platform. Third 3PandaLabs product, after
RentVault (`3pandalabs/nrighar`) and ReceiptCash.

## Naming

The product is **RsvpVault** (one word, camel case) in all user-facing copy —
renamed from "EviteVault" on 2026-07-28.

**The split is: every DNS name says `rsvpvault`, everything else says
`evitevault`.** That is the whole rule, and the dividing line is not taste —
it is what breaks when you get it wrong.

Identifiers that stay lowercase `evitevault`, permanently: repo name, database,
the `evitevault_app` Postgres role, R2 buckets (`evitevault-media`,
`evitevault-backups`), Coolify resources, and the `app: "evitevault"` key in
`api/src/routes/metrics.ts` that `3pandalabs/admin` reads. Renaming those buys
nothing and breaks the admin dashboard, backups and the Coolify wiring at once.
This is the same split RentVault made when it stopped being NRIGhar — see that
repo's CLAUDE.md.

Names that are `rsvpvault`:

1. **The sender address**, `invitations@rsvpvault.3pandalabs.com` (switched
   2026-07-28) — guests read the from-line. See `infra/email-setup.md`.
2. **The public web hostname**, `rsvpvault.3pandalabs.com` (2026-10-26) —
   people type it, link it and search for it. A domain spelling a name the site
   itself never uses cannot be found: nothing on the page said "evitevault", so
   neither name matched anything and the site was absent from Google for three
   months.
3. **Both API hostnames**, `api.rsvpvault.3pandalabs.com` and
   `api-internal.rsvpvault.3pandalabs.com` (2026-10-27) — and this one is a TLS
   constraint, not a naming preference. **All hostnames for one app must share
   a first label.** Cloudflare issues the per-app edge certificate for
   `<label>.3pandalabs.com` + `*.<label>.3pandalabs.com`; that inner wildcard is
   the only thing covering a two-label `api.<app>` name, and it lives only while
   the first-label hostname has a DNS record. The API hosts were left under
   `evitevault` during the web rename on the reasoning that nobody reads them —
   which was true and irrelevant. Deleting `evitevault.3pandalabs.com` revoked
   the wildcard with it, and the API was unreachable at the edge for a day:
   `curl` exit 35, HTTP 000, and nothing whatsoever in the origin's logs,
   because requests never reached the origin.

So: when adding user-visible text, say RsvpVault; when adding config or
infrastructure, match the existing `evitevault` identifiers. Do not introduce
a third spelling.

## Monorepo layout

`web/` (Next.js on Cloudflare Workers) · `api/` (Fastify on Coolify/Hetzner) ·
`infra/` (runbooks) · `android/` (Play Store wrapper). Same shape as
`3pandalabs/nrighar`, minus `app/` — there is no native mobile client, and the
guest experience is deliberately web-only so an invitation link works for
anyone with a browser. `android/` is a Bubblewrap Trusted Web Activity for
hosts: it opens the live site full screen, so web deploys update it without a
store release. It only works while `/.well-known/assetlinks.json` lists the
Play signing key — see `infra/play-store/README.md` before touching either.

## Git flow

Never commit directly to `main`. Branch → PR → merge, committing as
`3pandalabs-admin` (the conditional gitconfig under `~/Documents` handles the
identity automatically).

## Public slugs are the whole security boundary for guests

Guests are not authenticated. Two unguessable values gate everything they can
reach:

- `events.slug` — a random UUID string. Knowing it lets you *view* a published
  invitation. Never make it sequential, human-guessable, or derived from the
  title.
- `guests.invite_token` — a random UUID, one per invited guest. Knowing it lets
  you RSVP *as that guest*. It is the only credential on the RSVP path.

Consequences worth remembering before adding a public route:

- Public routes live in `api/src/routes/publicEvents.ts` and must never accept
  an `id` — only a `slug`, only for events with `status = 'published'`.
- Never return `guests.email`/`phone`, host details, or another guest's token
  from a public route. `toPublicEvent()` in that file is the only serializer
  allowed to shape a public response; extend it rather than hand-rolling.
- An open RSVP (no token) creates a *new* guest row. It must never let a caller
  overwrite an existing invited guest's response by guessing their email.

## /metrics is mandatory

Per the org convention, every app exposes an ops-only `GET /metrics` behind the
shared `METRICS_TOKEN` bearer, and gets a per-app "Usage & resources" table on
admin.3pandalabs.com. `api/src/metrics/collector.ts` + `routes/metrics.ts`
implement it here; the app key is `evitevault`.

The response envelope — `app`, `collectedAt`, `uptimeSeconds`, `counts`,
`traffic`, `process`, `database` — is **shared verbatim across every
3PandaLabs app**, and `collector.ts` is a byte-for-byte copy of the other
apps'. The admin page's rendering script is fully generic over that shape, so
changing it here doesn't customise this app, it forces a special case into a
page that currently has none. The `counts` keys are the per-app part and are
free to change. When a route or auth boundary
changes, also update this app's Mermaid flow diagram in `3pandalabs/admin`.

## Deployment gotchas inherited from RentVault

These cost real hours on `nrighar`; they apply verbatim here.

- `web/package.json` build script is `next build --webpack`. Turbopack output
  is not fully supported by `@opennextjs/cloudflare` — the deploy succeeds and
  every route then 500s with `ChunkLoadError` at request time.
- Do not add a `proxy.ts`/middleware to `web/`. The adapter cannot bundle it
  (Node-only `async_hooks`). Auth is enforced in layouts plus the API's own
  `requireAuth` — the API is the real boundary.
- Server-side Worker code must call the API over `INTERNAL_API_URL`
  (`api-internal.rsvpvault.3pandalabs.com`, DNS-only), not the proxied public
  hostname — Cloudflare blocks same-account "orange-to-orange" fetches before
  any WAF rule can allow them. `INTERNAL_API_URL` is intentionally not
  `NEXT_PUBLIC_`-prefixed so browser bundles fall back to the public host.
- In Coolify, **Base Directory** is `api` and **Dockerfile location** is
  `Dockerfile` (not `api/Dockerfile` — that resolves to `api/api/Dockerfile`).
  Set Ports Exposes to `8080`, and enter domains *with* the `https://` scheme.
- Migrations run at container start (`Dockerfile` CMD). Every migration must be
  idempotent (`ADD COLUMN IF NOT EXISTS`, `DO $$ ... WHEN duplicate_object`) —
  a non-idempotent migration crash-loops the container and takes prod down.
- Do not set `MIGRATION_DATABASE_URL`. `evitevault_app` owns its database and
  runs its own DDL; migrating as `postgres` creates objects the runtime role
  cannot read (42501).

## Background work: one interval, in the API container

`api/src/jobs/pendingInvitations.ts` runs hourly inside the API process and
finishes guest lists the day's mail allowance could not. The shared gateway
caps this app at a fixed number of messages per UTC day, so a hundred-guest
list sends sixty and rejects forty; the job picks the rest up once the
allowance resets, instead of the host having to notice and press a button
again tomorrow.

Three properties worth preserving if you touch it:

- **It cannot double-send.** It selects guests with an address and
  `invitedAt is null`, and `invitedAt` is written from the send result. A
  crash-loop, a restart, or two overlapping runs all converge on the same
  answer, because a delivered guest stops matching.
- **Soonest event first**, past events excluded. When the allowance covers only
  part of what is waiting, this Saturday's wedding should get it before one in
  March, and an invitation arriving after the day is worse than none.
- **It stops the moment the gateway reports `quota_exceeded`** rather than
  grinding through the remaining events into guaranteed rejections — which
  would also undo the ordering, since every event would be equally rejected.

A plain `setInterval`, not a cron service or a queue: this API is a single
long-running container, so there is exactly one of these, and a second
deployable would mean another thing to keep alive and another credential to
hold. Missing a tick costs an hour against a quota that resets daily.

## New sign-up alert

Every new host account emails **"RsvpVault New user"** (email, display name if
given, signup time UTC, user id) to `NEW_USER_ALERT_EMAIL` (default
3pandas@3pandalabs.com; `off` disables) — `api/src/lib/newUserAlert.ts`, called
from `POST /auth/register` only when the insert created a row (an existing
email sends nothing). That is the only place a user row is created; if you add
another (admin-made, seeded, backfilled), decide deliberately whether it is a
real sign-up before calling `notifyNewUser`. Fire-and-forget through the shared
gateway (this app's sender, one message off the daily allowance): a mailer
failure only logs, never touches the sign-up. Same shape as AdVault's.

## Video invites (2026-11-26)

The first PAID feature. A host gets a short 9:16 video for an event:

- **Simple** ($3 by default, may be FREE): a TEMPLATE video, made in seconds
  in the API container by ffmpeg, no Google/fal. The occasion's pre-made 8 s
  9:16 clip (our three pandas in the lower half, clean background in the top
  ~40%) with the host's lines written into the top area: kicker ("You're
  invited to"), headline, when, where. Layout rules (auto-shrink, headline wraps
  in two, block centred in the top area) are pure in `policy.ts`
  (`layoutTextLines`, tested); `lib/videoInvites/compose.ts` draws them. Host
  text NEVER enters the filter graph: each line is a file in a temp dir, drawn
  with drawtext `textfile=` + `expansion=none`, ffmpeg spawned with an argument
  array in that dir. The clip's own audio is kept. Font: bundled Geist Regular
  (OFL, `api/assets/fonts/`, copied into the image); ffmpeg comes from
  `apk add ffmpeg` in `api/Dockerfile`.
- **Clips: five non-talking variants per occasion,
  `web/public/video-invites/clip-<occasion>-<1..5>.mp4`** (from Muse; served by
  the web app, fetched by the API from `WEB_ORIGIN`). The order stores its
  `variant`; the render tries `clip-<occasion>-<n>.mp4`, then
  `clip-<occasion>.mp4`, then `clip-default.mp4` (`clipCandidates`). Today only
  the single PLACEHOLDER per occasion exists (the occasion JPG with a slow
  zoom, silent, 8 s), so every variant falls back to it. The form's "Try
  another" cycles 1..5 over posters `clip-<occasion>-<n>.jpg` (falling back to
  `clip-<occasion>.jpg`, then `pandas-<occasion>.jpg`); make posters with
  `node web/scripts/make-clip-posters.mjs` (local ffmpeg) after adding clips.
  Every remake counts toward the free daily cap as before.
- **Narrator voiceover (Simple, 2026-11-26, migration 0013):** the host's "message to read
  out" (prefilled from the event, `defaultNarration`; same `cleanScript` /
  `scriptProblem` rules and 200-character cap as a Pro script, errors
  `narration_*`; empty = music only) is spoken by ONE fixed warm voice
  (`lib/videoInvites/tts.ts`): Google Cloud Text-to-Speech first
  (texts:synthesize with the same `GOOGLE_SA_KEY_B64` token as Omni, voice
  `TTS_VOICE`, default `en-US-Studio-O`; the Cloud Text-to-Speech API must be
  enabled on that project), fal ElevenLabs second, else NO voice (the video is
  still made, text on screen). No edge-tts: there's no cheap Node-only path.
  Identical (provider, voice, text) is cached in R2 at `tts/<sha256>.mp3`.
  Mix (`mixPlan`, `composeArgs`): the voice starts 0.4 s in over the clip's
  music at -12 dB; if it runs past the clip, the clip loops to voice end +
  0.8 s; output never over 15 s. `video_invites.voice_provider` records who
  spoke it. ffprobe (same Alpine ffmpeg package) measures clip and voice.
- **On-screen text:** ~35% larger (headline base 140 px of 1080), emoji and
  any glyph the bundled font can't draw are stripped (`stripUnsupportedGlyphs`
  in `cleanTextLines`; no boxes), and the dark band is sized from the last
  drawn line (`scrimHeight`) so it always covers the whole block.
- **Free Simple**: `VIDEO_INVITE_PRICE_SIMPLE_CENTS=0` skips Stripe; the
  order is inserted `paid` and queued at once, at most 5 per host per UTC day
  (429 `free_daily_limit`). A failed free order needs no refund. Pro can never
  be free (it pays for Google/fal).
- **Pro** ($5): the host's own photo says their words; requires the consent
  tick "This is me, or I have consent from everyone in this photo.", stored
  with the time and exact sentence. Google first, fal fallback (below). Rules in `api/src/lib/videoInvites/policy.ts`
(tested), routes in `api/ROUTES.md` "Video invites", job in
`api/src/jobs/videoInvites.ts`, web card
`web/src/app/dashboard/events/[eventId]/video-invite.tsx`; the public page
shows the newest ready video at the top (`toPublicEvent().videoInviteUrl`).

- **`VIDEO_INVITES` = `on` | `admins` | anything else = off.** `admins` makes
  the feature visible and usable ONLY for accounts whose REAL database role is
  admin, and for test hosts whose owner is still a real admin
  (`adminStanding()` in `lib/testMode/index.ts`, the same lookup as
  `requireRealAdmin`; `videoInvitesVisibleTo` in `policy.ts`, tested). Everyone
  else gets exactly "off": host routes 404 and the card renders nothing. The
  job and the public page's ready video run in `on` and `admins` (only admins
  can create videos in `admins`, so nothing leaks). The web never decides on
  role: `/auth/me` returns `features.videoInvites`, computed on the server
  (`lib/videoInvites/access.ts`), and the card itself renders nothing on the
  API's 404. Per tier: Simple needs ffmpeg, Pro needs Google or fal, and a paid
  tier also needs Stripe; otherwise 503 `video_invites_unavailable`. Every key
  is optional; the API always boots.
- **Money first, then generation (paid orders).** An order is created `pending_payment`
  with a Stripe Checkout session (`metadata.app=rsvpvault`,
  `kind=video_invite`, `order_id`). Only the signature-verified webhook
  (`POST /webhooks/stripe`, raw-body parser in `index.ts`) moves it to `paid`,
  and the job only ever claims `paid` rows (conditional UPDATE, one at a time).
  The org Stripe account is shared: everything not tagged rsvpvault is
  answered 200 and ignored.
- **Pro: Google first, fal fallback** (`VIDEO_INVITE_PROVIDERS`, default
  `vertex,fal`), like AdVault's Omni path. Google = Gemini Omni on Vertex
  (`lib/videoInvites/google.ts`, copied from AdVault's `lib/ai/google/omni.ts`,
  `GOOGLE_SA_KEY_B64`), image-to-video where the model speaks the line itself
  and its generated audio IS the voice. fal = ElevenLabs TTS + a talking-avatar
  model (`FAL_AVATAR_ENDPOINT`). Any Google error tries fal. The order records
  `provider` (`template` for Simple), and a fallback reason stays in `error`
  for ops.
- **Pro script cap 200 characters** (~13 s): Omni makes at most 15 s clips, and
  every provider bills per second. Bracketed tags and links are refused or
  stripped (`cleanScript` / `scriptProblem`).
- **Never charge for nothing.** Two attempts, then `failed` (+
  `refund_needed` when it was paid); logged as "VIDEO INVITE FAILED, REFUND NEEDED" and counted
  in `/metrics` `counts.videoInvitesRefundNeeded` (should be 0). Ops refunds in
  Stripe and sets the row `refunded`. A `generating` row older than 20 min
  (process died) goes back to `paid`.
- **Panda scenes (live) are Anil-supplied**, made in Muse on 2026-11-26:
  `web/public/video-invites/pandas-<occasion>.jpg`, 9:16 portrait, 1080x1920,
  JPG ~q85 (200-350 KB), one per occasion, all showing our three established
  pandas (round glasses + white apron over a blue shirt, orange t-shirt, navy
  suit). Since the template change they are the Simple form's live PREVIEW
  background (and the source of the placeholder clips); `pandas-default.jpg`
  is a copy of the party scene.
- `web/scripts/generate-panda-scenes.mjs` is an OPTIONAL tool for future
  occasions: it edits `web/scripts/panda-reference.png` (the Thanksgiving
  frame) into a draft scene, Google Gemini image edit first, fal edit
  fallback, written to `web/scripts/out/` (never straight to `public/`).
  Paid: run only with Anil's OK, review, then convert to the JPG format above.
- Photos and videos live under `events/<id>/` in R2, so ownership checks and
  account deletion cover them; rows cascade with the event. Privacy and terms
  pages describe the feature (Simple is made on our server; only Pro goes to
  Google/fal) and Stripe.

## Admin tools (2026-11-26, migration 0011, `api/src/lib/testMode`)

The same model as AdVault ("Test as customer", test customers, internal and
marked-test accounts), COPIED not imported, with RsvpVault's names. Routes in
`api/ROUTES.md` "Admin tools"; web `/dashboard/admin` + the banner in
`web/src/app/dashboard/admin-bar.tsx`.

- **Who is admin:** `users.role = 'admin'` (CHECK allows `host`/`admin`). There
  is no UI to grant it; an operator runs SQL against the database:
  `UPDATE users SET role = 'admin' WHERE email = '<address>';` The JWT carries
  the role for up to 15 minutes, so admin routes (`requireRealAdmin` in
  `lib/testMode/index.ts`) re-read it from the database every time and refuse
  a session inside a test host.
- **Test as host** (`users.test_as_host`, `PATCH /auth/me/test-mode`, real
  admins only): the admin is treated exactly like a host in host flows. Any
  host-flow check that would read `role === "admin"` must go through
  `hostIdentity()` / `customerFlowRole()`, never the raw role. Admin pages keep
  the real role so the admin can always switch back. Banner on every dashboard
  page while on.
- **Test hosts** (`users.test_owner_id` = the admin, `routes/testHosts.ts`):
  role host, `test-…@test.rsvpvault.invalid`, random password; `/auth/login`
  refuses them and password reset sends nothing. The admin switches in (new
  token pair carrying a `testOwner` claim) and back ("Back to admin" banner,
  accepted only from a session with the claim, re-checked against the DB).
  Not a sign-up: no "RsvpVault New user" alert. Always in test mode. Deleted
  with their admin (FK cascade).
- **Test mode = 50-cent payments.** Paid video invites cost `TEST_PRICE_CENTS`
  (`chargeCents`), the Stripe session and payment are tagged `test_mode=1`, the
  order has `video_invites.test_mode`, and revenue excludes it. Free Simple
  stays free. A test host's .invalid email is never sent to Stripe.
- **NO email to real guests in test mode (the safe option, deliberately).**
  Every host-initiated guest email goes through `sendGuestMail(hostId, …)`
  (invitations incl. the pending job, announcements, photo album, greetings):
  in test mode ONLY the real admin's own login address is reached; every other
  message is suppressed, counted (`testNotSent` / `testSuppressed` in the
  responses, "Test mode: N not sent" in the UI) and never delivered. Not a
  domain allowlist: guest lists are pasted from real contacts, and one real
  friend in a test event must not get a real invitation. Suppressed guests
  keep `invited_at` null (never marked invited). To see a real invitation in
  test mode, add your own address as a guest. Guest-initiated mail (the RSVP
  confirmation a guest asks for) is unchanged. Never add a guest send path
  that calls `sendMail` directly.
- **Internal** (`users.is_internal` + `internal_label`) and **marked test**
  (`users.marked_test`), set on the Users page (`POST /admin/users/:id/flags`):
  change NO price, gate or email; they only keep an account out of customer
  counts and revenue. Marked test: ordinary hosts only (409 for admins and
  test hosts); internal: never on a test host.
- **"Real customer"** = role host, not a test host, not internal, not marked
  test (`isRealCustomer`, and the same SQL in `routes/admin.ts` / `/metrics`).
  `/metrics` `counts` gained `realHosts`, `admins`, `testHosts`,
  `internalAccounts`, `markedTestAccounts`, `videoInviteRevenueCents` (real
  customers, paid, not test, not refunded) and `videoInvitesTestMode`; `hosts`
  still counts every users row. The `3pandalabs/admin` page should show
  `realHosts` instead of `hosts`, and its RsvpVault Mermaid diagram needs the
  new boundaries: admin routes (DB role check), test-host switch/back, and the
  guest-mail guard in front of the mailer.
- Tests: `lib/testMode/policy.test.ts` (pure: test mode, roles, 50-cent
  price, switching, the guest-mail guard, customer counting, flag rules). No
  PGlite in this repo yet, so the DB paths are covered by the pure rules plus
  typecheck.

## Cash gifts with the RSVP (2026-11-26, migration 0012, `api/src/lib/gifts`)

A guest sends the host a cash gift from the invitation. Rules (fees, caps,
states, webhook routing) are pure in `lib/gifts/policy.ts` (tested); routes in
`api/ROUTES.md` "Cash gifts"; web: `web/src/app/dashboard/events/[eventId]/cash-gifts.tsx`
(host) and `web/src/app/e/[slug]/send-gift.tsx` (guest).

- **`CASH_GIFTS` = `on` | `admins` | off**, the same shape as `VIDEO_INVITES`
  (`lib/gifts/access.ts`, reusing `featureMode` / `videoInvitesVisibleTo` and
  `adminStanding`). Off for an account = host routes 404, the card renders
  nothing, the public page offers no gift. `/auth/me` `features.cashGifts`.
- **Stripe Connect destination charges, Express accounts, Stripe-hosted
  onboarding (Account Links), Express dashboard (login links).** Live on the
  org account. The platform is the merchant of record and LIABLE for refunds
  and chargebacks. The host's account is created US, `card_payments` +
  `transfers`, payouts delayed **7 days** (`settings.payouts.schedule.delay_days`)
  so a dispute can be absorbed. `users.stripe_account_id/status`; status from
  `accountStatus()` (none / needs_info / pending / ready), refreshed by
  `account.updated` (Connect webhook) and on every `GET /gifts/account`. Gifts
  can only be switched on, and only offered, while the account is `ready`.
- **Fees** (`giftBreakdown`, env-configurable): the guest pays gift A + our
  cut P (`GIFT_PLATFORM_FEE_BPS`, 150 = 1.5%) + the card fee S, grossed up so
  Stripe's 2.9% + 30c (`GIFT_STRIPE_PERCENT_BPS`, `GIFT_STRIPE_FIXED_CENTS`)
  on the WHOLE total is covered. `application_fee_amount = P + S`, so the
  platform nets P after Stripe's fee and the host receives exactly A. The
  guest sees the breakdown before paying (web `lib/gifts.ts` mirrors the math;
  Checkout shows the same two lines). Test proves host = A and platform net ≈ P
  for many amounts.
- **Risk controls:** $5 min / $250 max per gift (`GIFT_MIN_CENTS`,
  `GIFT_MAX_CENTS`); $2,000 per event per UTC day over gifts paid or in
  checkout (`GIFT_EVENT_DAILY_CAP_CENTS`); 10 gift checkouts per IP per hour;
  Stripe Radar defaults; 7-day payout delay; disputes logged as "GIFT
  DISPUTED" and counted in `/metrics` `counts.giftsDisputed` (should be 0, each
  one is ops work); terms §7a lets us recover refunded/disputed gifts from the
  host's later gifts or ask them to repay; guests are told gifts are
  non-refundable except error or fraud. A host can't delete their account while
  a live gift paid in the last 120 days (or a dispute) is on record (409
  `recent_gifts`): we'd lose the records a dispute needs.
- **Test mode never moves real money.** Stripe mode follows the HOST
  (`hostStripeMode`): an admin testing as host or a test host uses
  `STRIPE_TEST_SECRET_KEY` and a separate test connected account
  (`users.stripe_test_account_id/status`); gifts are `gifts.test_mode` and
  excluded from metrics. No test key = test mode is refused
  (`gifts_test_unavailable`), never a live charge.
- **Webhook:** the existing `POST /webhooks/stripe` handles gifts first
  (`routeGiftEvent` / `applyGiftEvent`, idempotent, every move conditional on
  the status it leaves), then video invites. It accepts any of four signing
  secrets (live/test × platform/Connect); the endpoint list and event types
  are in ROUTES.md. Refunds and disputes match gifts by payment intent.
- **Privacy:** amounts are host-only; the public page gets only whether a
  gift may be sent and how (`toPublicEvent().gifts`). Privacy page lists gift
  data and Stripe Express onboarding; terms §7a.
- `/metrics` counts: `giftsPaid`, `giftsDisputed`, `giftVolumeCents`,
  `giftPlatformFeeCents`, `giftHostsReady` (live only).

## Not used here

No Temporal, no native mobile app (`android/` is only a TWA shell), no Supabase. The hourly job above is deliberately
the small version; if durable multi-step work ever genuinely needs retries,
visibility and backoff, follow the RentVault worker pattern rather than growing
that interval into a queue.
