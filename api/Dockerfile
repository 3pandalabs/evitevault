# Multi-stage build: compile TypeScript in a full node image, run on a slim one.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

# Coolify/Traefik terminates TLS in front of this container; it only ever needs
# to listen on plain HTTP inside the private Docker network.
RUN addgroup -S evitevault && adduser -S evitevault -G evitevault
USER evitevault

EXPOSE 8080

# Migrate-on-start. Every migration in drizzle/ must be idempotent
# (ADD COLUMN IF NOT EXISTS, DO $$ ... WHEN duplicate_object guards): a
# migration that fails on re-run crash-loops this container and takes the API
# down, which is exactly what happened to RentVault on 2026-07-24.
#
# migrate.js runs as the runtime role (DATABASE_URL). `evitevault_app` owns the
# `evitevault` database and can run DDL. Do NOT set MIGRATION_DATABASE_URL to a
# superuser: with no default privileges configured on the shared instance,
# tables it created would be owned by `postgres` and unreadable by the runtime
# role. See src/db/migrate.ts for the 42501 ownership gotcha.
#
# Seeding DOES run here, unlike the note that used to sit in this spot. The
# seed is only the built-in invitation designs, it upserts on the stable `key`,
# and it touches nothing a host owns (host templates carry a user-id-prefixed
# key). Twenty-six rows at boot cost nothing.
#
# What changed the calculus: adding designs is now routine product work, and
# `docker exec … node dist/db/seed.js` is the only other way to apply it — a
# manual step, on a box, that has to be remembered after every deploy that adds
# a template. A design that only exists in git is a design no host can pick, and
# that failure is silent. Keeping it here means a deploy ships the designs it
# was built with.
#
# Same rule as migrations, then: the seed must stay idempotent and must not
# throw on a re-run, or it crash-loops the container.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/index.js"]
