import cors from "@fastify/cors";
import Fastify, { type FastifyError } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { authPlugin } from "./auth/plugin.js";
import { env } from "./env.js";
import { startPendingInvitationsJob } from "./jobs/pendingInvitations.js";
import { recordRequest, startCpuSampler } from "./metrics/collector.js";
import { announcementRoutes } from "./routes/announcements.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { guestbookModerationRoutes } from "./routes/guestbook.js";
import { guestRoutes } from "./routes/guests.js";
import { metricsRoutes } from "./routes/metrics.js";
import { publicEventRoutes } from "./routes/publicEvents.js";
import { storageRoutes } from "./routes/storage.js";
import { templateRoutes } from "./routes/templates.js";

const app = Fastify({
  logger: true,
  // Coolify's Traefik terminates TLS and proxies over the private Docker
  // network, so the socket's remote address is always the proxy. Without this,
  // req.ip is useless and rate limiting/analytics would bucket every visitor
  // together. Cloudflare sits in front of Traefik — lib/analytics.ts prefers
  // CF-Connecting-IP, which Cloudflare overwrites and a client cannot forge.
  trustProxy: true,
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true });
await app.register(authPlugin);

// `ok` is what the container health check reads and its shape must not change.
//
// The other two answer a question that was unanswerable from outside the box:
// which build is actually running. `commit` is baked into the image at build
// time; `startedAt` is this process's start, so a redeploy is visible even when
// the commit is unchanged — a rebuild of the same SHA, or a crash-loop
// restarting under you, both of which look identical otherwise.
//
// Public on purpose, like the rest of /health. The repository is public, so a
// commit SHA discloses nothing that isn't already on GitHub, and needing a
// credential to answer "is my deploy live?" is what made this worth adding.
const startedAt = new Date().toISOString();

app.get("/health", async () => ({ ok: true, commit: env.GIT_COMMIT, startedAt }));

// Feeds the rolling requests-per-hour figure behind GET /metrics. Both ops
// endpoints are excluded so dashboard polling and container health checks don't
// register as app traffic.
startCpuSampler();
app.addHook("onResponse", async (req) => {
  if (req.url !== "/metrics" && req.url !== "/health") recordRequest();
});

app.setErrorHandler((err: FastifyError & { code?: string }, req, reply) => {
  // Postgres unique_violation — e.g. a race on the per-event guest email index
  // — is a conflict, not a server fault.
  if (err.code === "23505") {
    return reply.code(409).send({ error: "conflict" });
  }
  // A CHECK constraint rejecting a value means the request body was invalid in
  // a way the Zod schema didn't catch (usually a cross-field rule).
  if (err.code === "23514") {
    return reply.code(400).send({ error: "invalid_request" });
  }
  if (err.validation) {
    return reply.code(400).send({ error: "invalid_request", details: err.validation });
  }
  // Anything Fastify itself rejected before the handler ran — an empty body
  // declared as application/json, an unsupported content type, a payload over
  // the limit. These carry a 4xx statusCode already, and answering
  // "internal_error" for them actively misleads: it points debugging at the
  // server when the request was malformed. FST_ERR_CTP_EMPTY_JSON_BODY reached
  // production this way on 2026-07-27 and read as a missing route.
  const status = err.statusCode ?? 500;
  if (status < 500) {
    return reply.code(status).send({ error: err.code ?? "bad_request" });
  }
  req.log.error(err);
  return reply.code(status).send({ error: "internal_error" });
});

await app.register(authRoutes);
await app.register(eventRoutes);
await app.register(guestRoutes);
await app.register(guestbookModerationRoutes);
await app.register(announcementRoutes);
await app.register(templateRoutes);
await app.register(storageRoutes);
// Anonymous by design — registered last so it's obvious in this list that
// everything above it is behind requireAuth.
await app.register(publicEventRoutes);
await app.register(metricsRoutes);

// Finishes guest lists the day's mail allowance could not. A hundred-guest
// list sends sixty and rejects forty; this picks the forty up once the
// allowance resets, instead of the host having to notice and press a button
// again tomorrow. See jobs/pendingInvitations.ts.
startPendingInvitationsJob((msg) => app.log.info(msg));

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
