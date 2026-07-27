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
# Seeding is deliberately NOT in this CMD — it is an occasional, explicit
# operation (`node dist/db/seed.js` in the container), not something that should
# run on every restart.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
