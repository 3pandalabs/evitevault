# Web — Cloudflare Workers deploy

`evitevault-web` is a Next.js 16 app deployed to Cloudflare Workers through
`@opennextjs/cloudflare`. No Vercel, no Pages.

```bash
cd web
npm run cf:deploy        # opennextjs-cloudflare build && … deploy
```

`wrangler.jsonc` declares `rsvpvault.3pandalabs.com` as a custom domain, so
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
NEXT_PUBLIC_API_URL   https://api.rsvpvault.3pandalabs.com
NEXT_PUBLIC_SITE_URL  https://rsvpvault.3pandalabs.com
INTERNAL_API_URL      https://api-internal.rsvpvault.3pandalabs.com
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
curl -sI https://rsvpvault.3pandalabs.com | head -1
# an invitation, once one is published:
curl -s https://rsvpvault.3pandalabs.com/e/<slug> | head -c 200
```

```bash
# the two SEO surfaces Next.js generates from src/app/{robots,sitemap}.ts
curl -s https://rsvpvault.3pandalabs.com/robots.txt | grep -i sitemap
curl -s https://rsvpvault.3pandalabs.com/sitemap.xml
```

Cloudflare injects its own managed block into `/robots.txt` — the
Content-Signal preamble and the AI-crawler `Disallow` list. It merges with what
the Worker returns rather than replacing it, which is why the grep above exists:
if the `Sitemap:` line stops surviving that merge, nothing breaks, but
discovery then rests entirely on the Search Console submission below.

## Search engine indexing

Being crawlable is not being indexed. Up to 2026-10-26 the site was fully
crawlable — `200` to Googlebot, `Allow: /`, no `noindex` — and absent from
Google anyway, because nothing had ever told Google it existed: no Search
Console property, no sitemap, and one inbound link from an apex site that was
itself unindexed.

One-time, in the dashboard:

1. **Search Console → Add property → Domain** (not URL prefix) → `3pandalabs.com`.
   A domain property covers every app subdomain, present and future, so this is
   the last time any 3PandaLabs app needs this step.
2. Add the `google-site-verification` TXT record it gives you to **Cloudflare
   DNS for `3pandalabs.com`**. Verification is usually minutes.
3. **Sitemaps → Add a new sitemap** → `https://rsvpvault.3pandalabs.com/sitemap.xml`.
4. **URL Inspection** → the site root → **Request indexing**. This is the step
   that actually gets a brand-new hostname crawled; everything else is
   preparation for it.

Then wait. A new hostname with no link history takes days to weeks to appear,
and "Request indexing" is a nudge, not a guarantee. Check progress under
**Pages** in Search Console rather than by running `site:` searches, which lag.
