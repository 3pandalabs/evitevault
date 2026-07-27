import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../env.js";

// Behind Cloudflare + Traefik, req.ip is the proxy. CF-Connecting-IP is the
// only header here that Cloudflare guarantees it overwrites on every request,
// so it can't be spoofed by a client — X-Forwarded-For can be, since Cloudflare
// appends rather than replaces.
function clientIp(req: FastifyRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.ip;
}

// Salted, truncated hash of IP + user agent. Deliberately not reversible and
// not stored alongside anything identifying: it exists only to collapse one
// person refreshing into one view. Rotating ANALYTICS_SALT resets all dedupe
// buckets, which is fine — historical counts are unaffected.
export function visitorHash(req: FastifyRequest): string {
  const ua = String(req.headers["user-agent"] ?? "");
  return crypto
    .createHash("sha256")
    .update(`${env.ANALYTICS_SALT}|${clientIp(req)}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

export function currentHour(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d;
}
