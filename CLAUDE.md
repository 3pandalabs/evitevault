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
`infra/` (runbooks). Same shape as `3pandalabs/nrighar`, minus `app/` — there
is no mobile client, and the guest experience is deliberately web-only so an
invitation link works for anyone with a browser.

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

## Not used here

No Temporal, no mobile app, no Supabase. If durable multi-step work appears
later (bulk invitation email sends are the likely first case), follow the
RentVault worker pattern rather than inventing a new one.
