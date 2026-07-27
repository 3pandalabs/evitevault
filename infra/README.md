# EviteVault infrastructure

EviteVault reuses the shared 3PandaLabs infrastructure — there is no new server,
no new Postgres instance, and no new Cloudflare account. What is specific to
this app is a database, a role, two R2 buckets, one Coolify application, three
DNS records and one Worker.

| Piece | Where | Name |
|---|---|---|
| Postgres database + owning role | shared `3pandalabs-postgres` on `nrighar-coolify-fsn` | `evitevault` / `evitevault_app` |
| API container | Coolify on `nrighar-coolify-fsn` (Falkenstein, `167.233.223.241`) | `evitevault-api` |
| Object storage | Cloudflare R2 | `evitevault-media`, `evitevault-backups` |
| Web | Cloudflare Workers (`@opennextjs/cloudflare`) | `evitevault-web` |

## Hostnames

| Host | Cloudflare | Points at | Why |
|---|---|---|---|
| `evitevault.3pandalabs.com` | Worker custom domain | `evitevault-web` | |
| `api.evitevault.3pandalabs.com` | **Proxied** (orange) | `167.233.223.241` | Public API. Must be proxied — the Hetzner firewall only admits Cloudflare IPs on 80/443 |
| `api-internal.evitevault.3pandalabs.com` | **DNS only** (grey) | `167.233.223.241` | Server-side calls from the Worker. See the orange-to-orange note below |

The grey-cloud record is the one exception to "every hostname on the box must be
proxied": a Cloudflare Worker cannot fetch a proxied hostname on the same
account (orange-to-orange), and the block happens before any WAF rule can allow
it. Because it bypasses the proxy, it also bypasses the firewall's
Cloudflare-only source restriction — that is a deliberate, understood trade, the
same one RentVault makes.

## Order of operations

1. `r2-setup.md` — buckets and the API token (the Coolify backup config needs
   the credentials, so this comes first).
2. `postgres-setup.md` — database and role on the shared instance.
3. DNS records above — **before** the first Coolify deploy, or the Let's Encrypt
   challenge has nothing to resolve.
4. `coolify-setup.md` — the `evitevault-api` application.
5. `web-deploy.md` — the Worker and its custom domain.

## Gotchas inherited from RentVault

Each of these cost real time on the previous app; they are unchanged here.

- Coolify **Base Directory** `api`, **Dockerfile location** `Dockerfile` — not
  `api/Dockerfile`, which resolves to `api/api/Dockerfile`.
- Enter domains **with** the `https://` scheme, or Traefik builds a broken rule
  with an empty Host matcher and never requests a certificate.
- Set **Ports Exposes** to `8080`; Coolify defaults new resources to `3000`.
- After editing Traefik's config in Coolify's Proxy → Configuration tab, click
  **Restart Proxy**, not just Save — Traefik only reads static config at start.
- Coolify container names are opaque random ids. Find Postgres with
  `docker ps --format '{{.Names}}\t{{.Image}}'` and confirm with
  `docker exec -i <name> psql -U postgres -c '\l'`.
