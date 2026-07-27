# EviteVault — repo conventions

Digital invitation + event management platform. Third 3PandaLabs product, after
RentVault (`3pandalabs/nrighar`) and ReceiptCash.

## Naming

The product is **EviteVault** (one word, camel case) in all user-facing copy.
Every internal identifier is lowercase `evitevault` — repo, database, the
`evitevault_app` Postgres role, R2 buckets, Coolify resources, hostnames, the
`/metrics` app key. Do not introduce a second spelling; RentVault's rename
(see that repo's CLAUDE.md) is the cautionary tale — copy changed, identifiers
deliberately did not.

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
  (`api-internal.evitevault.3pandalabs.com`, DNS-only), not the proxied public
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
