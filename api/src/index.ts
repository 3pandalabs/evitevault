import cors from "@fastify/cors";
import Fastify, { type FastifyError } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { authPlugin } from "./auth/plugin.js";
import { env } from "./env.js";
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

app.get("/health", async () => ({ ok: true }));

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
  req.log.error(err);
  return reply.code(err.statusCode ?? 500).send({ error: "internal_error" });
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

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
