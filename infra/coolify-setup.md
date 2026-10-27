# Coolify — the `evitevault-api` application

Prerequisites: `r2-setup.md` (needs the API token), `postgres-setup.md` (needs
the connection string), and the DNS records below **already resolving** — the
Let's Encrypt challenge fails otherwise.

## 1. DNS first

Cloudflare → DNS → Records on the `3pandalabs.com` zone:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api.rsvpvault` | `167.233.223.241` | **Proxied** (orange) |
| A | `api-internal.rsvpvault` | `167.233.223.241` | **DNS only** (grey) |

The grey-cloud record is required, not an oversight — see `README.md` on
orange-to-orange. Everything else on this box must be orange, because the
Hetzner firewall `nrighar-coolify-fw` only admits Cloudflare's ranges on 80/443.

**Both names must sit under the same first label as the web host**
(`rsvpvault`), and that is a TLS constraint rather than a tidiness preference.
Cloudflare issues the per-app edge certificate for
`<first-label>.3pandalabs.com` + `*.<first-label>.3pandalabs.com`; the inner
wildcard is the only thing covering a two-label `api.<app>` name, and it exists
only while the first-label hostname has a DNS record. These records previously
sat under `evitevault`, and deleting `evitevault.3pandalabs.com` during the
2026-10-26 rename revoked that wildcard and took the public API offline at the
edge for a day. See [[cloudflare_two_label_subdomain_certs]] in the notes.

## 2. Create the application

Coolify → project → **New Resource → Application → Public Repository**

- Repository: `https://github.com/3pandalabs/evitevault`, branch `main`
- **Build Pack:** Dockerfile
- **Base Directory:** `api`
- **Dockerfile location:** `Dockerfile` — relative to the base directory. Do
  **not** write `api/Dockerfile`; it resolves to `api/api/Dockerfile` and the
  build fails with "no such file or directory".
- **Ports Exposes:** `8080`. Coolify defaults to `3000`, which builds fine and
  then serves nothing but bad gateways.
- **Domains:** `https://api.rsvpvault.3pandalabs.com,https://api-internal.rsvpvault.3pandalabs.com`
  — **include the `https://` scheme on both**. A bare hostname generates a
  broken Traefik rule (the domain lands in the path matcher with an empty Host),
  no certificate is ever requested, and Traefik silently serves its default
  self-signed cert.

## 3. Environment variables

| Key | Value | Secret |
|---|---|---|
| `DATABASE_URL` | `postgres://evitevault_app:<pw>@fj1trumhdfozqharrsx1frm9:5432/evitevault` | yes |
| `JWT_SECRET` | `openssl rand -hex 32` | yes |
| `ANALYTICS_SALT` | `openssl rand -hex 32` | yes |
| `CORS_ORIGINS` | `https://rsvpvault.3pandalabs.com` | no |
| `WEB_ORIGIN` | `https://rsvpvault.3pandalabs.com` | no |
| `PORT` | `8080` | no |
| `R2_ACCOUNT_ID` | `f688cc57abfb9e1ef72a57f4841e0e73` | no |
| `R2_ACCESS_KEY_ID` | from `r2-setup.md` | yes |
| `R2_SECRET_ACCESS_KEY` | from `r2-setup.md` | yes |
| `R2_BUCKET` | `evitevault-media` | no |
| `R2_ENDPOINT` | `https://f688cc57abfb9e1ef72a57f4841e0e73.r2.cloudflarestorage.com` | no |
| `METRICS_TOKEN` | the shared org-wide value (same as `nrighar-api`) | yes |

`api/src/env.ts` validates the required ones eagerly at import, so the container
crashes at startup if any is missing rather than failing on the first request
that needs it. `METRICS_TOKEN` is deliberately optional.

Do **not** set `MIGRATION_DATABASE_URL`.

## 4. Deploy and verify

```bash
curl -s https://api.rsvpvault.3pandalabs.com/health          # {"ok":true}
curl -s https://api-internal.rsvpvault.3pandalabs.com/health # {"ok":true}
```

The grey-cloud one times out from anywhere that is not Cloudflare, including a
dev laptop — that is the Hetzner firewall working, not a fault. Check it from
the box with a `Host:` header instead.

An edge-level TLS failure on the proxied name (`curl` exit 35, HTTP 000,
nothing in the Traefik log) is a missing Cloudflare certificate, not a broken
origin, and the two are separate layers: Traefik's own Let's Encrypt cert lands
in `/data/coolify/proxy/acme.json` and can be perfectly valid while the edge
has nothing. Diagnose the edge with:

```bash
echo | openssl s_client -connect api.rsvpvault.3pandalabs.com:443 \
  -servername api.rsvpvault.3pandalabs.com 2>&1 | openssl x509 -noout -ext subjectAltName
```

Empty output means no edge certificate. Compare with a working sibling such as
`api.nrighar.3pandalabs.com`.

The invitation templates need no manual step: migrations *and* the template
seed both run at container start (`api/Dockerfile` CMD), so a deploy ships the
designs it was built with. Both must stay idempotent — the seed upserts on the
template `key` — because a failure in either crash-loops the container.

To apply a template change without a full redeploy, the seed is still safe to
run by hand from the container's terminal:

```bash
node dist/db/seed.js
```

## 5. After it's live

- Enable Coolify's GitHub integration for deploy-on-push to `main` once the
  pipeline has been exercised manually a few times.
- Add the Postgres backup schedule (see `postgres-setup.md`).
- Add the app to `admin.3pandalabs.com`: a "Usage & resources" table fed by
  `GET /metrics` (app key `evitevault`), plus a hand-authored Mermaid flow
  diagram, per the org conventions.
- Add RsvpVault's line to the Costs view — currently €0 incremental (shared
  box, R2 free tier, Workers free tier).
