# Web — Cloudflare Workers deploy

`evitevault-web` is a Next.js 16 app deployed to Cloudflare Workers through
`@opennextjs/cloudflare`. No Vercel, no Pages.

```bash
cd web
npm run cf:deploy        # opennextjs-cloudflare build && … deploy
```

`wrangler.jsonc` declares `evitevault.3pandalabs.com` as a custom domain, so
wrangler creates and maintains the DNS record itself — do not also add a manual
record for it in the Cloudflare dashboard.

## Two things that will break the deploy if changed

Both were learned the hard way on RentVault; the reasoning is in
`web/wrangler.jsonc` and the repo `CLAUDE.md`.

1. **`next build --webpack`, not Turbopack.** A Turbopack build deploys
   successfully and looks fine until a page is actually requested, at which
   point every route 500s with `ChunkLoadError: Failed to load chunk … from
   runtime`. The adapter does not fully support Turbopack output yet.
2. **No `proxy.ts` / middleware.** The adapter cannot bundle it — Next.js
   middleware pulls in Node-only `async_hooks`. Merely having the file present
   is enough to break the build. Auth lives in the dashboard layout plus the
   API's own `requireAuth`.

## Environment

Set in `wrangler.jsonc` `vars` (none of these are secret):

```
NEXT_PUBLIC_API_URL   https://api.evitevault.3pandalabs.com
NEXT_PUBLIC_SITE_URL  https://evitevault.3pandalabs.com
INTERNAL_API_URL      https://api-internal.evitevault.3pandalabs.com
```

`INTERNAL_API_URL` is what server-side code uses. It is not `NEXT_PUBLIC_`
prefixed on purpose: Next.js inlines unknown `process.env` reads as `undefined`
in the browser bundle, so browser code falls through to the public hostname —
which is correct, since a real browser is not subject to the orange-to-orange
restriction that forces server-side fetches onto the grey-cloud hostname.

There are no Worker secrets. The web app holds no credentials: host sessions
are bearer tokens held in the browser, and every authorization decision is the
API's.

## Verify

```bash
curl -sI https://evitevault.3pandalabs.com | head -1
# an invitation, once one is published:
curl -s https://evitevault.3pandalabs.com/e/<slug> | head -c 200
```
