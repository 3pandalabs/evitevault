# RsvpVault

Digital invitations and event management — hosts design an invitation, share one
link, and track RSVPs in real time. A 3PandaLabs product.

- **Web:** https://evitevault.3pandalabs.com
- **API:** https://api.evitevault.3pandalabs.com

## Layout

| Path | What |
|---|---|
| `web/` | Next.js 16 (App Router) + Tailwind v4 + shadcn/ui, deployed to Cloudflare Workers via `@opennextjs/cloudflare` |
| `api/` | Fastify 5 + Drizzle ORM + Zod + JWT, containerised and deployed to Coolify on the shared Hetzner box |
| `infra/` | Provisioning runbooks (R2, Postgres, Coolify, DNS) |

## Quick start

```bash
# API
cd api
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, R2_*
docker compose -f docker-compose.dev.yml up -d
npm install
npm run db:generate && npm run db:migrate
npm run db:seed               # loads the built-in invitation templates
npm run dev                   # http://localhost:8080

# Web
cd ../web
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

A published invitation lives at `/e/:slug`; a guest's personalised link is
`/e/:slug?t=:inviteToken`.

## Conventions

See `CLAUDE.md` for the rules that apply when changing this repo (naming,
branch/PR flow, the public-slug threat model, deployment gotchas).
