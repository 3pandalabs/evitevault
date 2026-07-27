import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken, type UserRole } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userRole?: UserRole;
  }
}

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

// Attaches req.userId/req.userRole when a valid access token is present but
// does not itself reject the request — use `requireAuth` as a preHandler on
// routes that must be authenticated. The split matters here: the public
// invitation routes are genuinely anonymous, and a global reject-on-missing
// hook would break the entire guest experience.
export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest("userId", undefined);
  fastify.decorateRequest("userRole", undefined);

  fastify.addHook("onRequest", async (req) => {
    const token = extractBearer(req);
    if (!token) return;
    try {
      const payload = verifyAccessToken(token);
      req.userId = payload.sub;
      req.userRole = payload.role;
    } catch {
      // Invalid/expired token: leave req.userId unset, requireAuth will 401.
    }
  });
});

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.userId) {
    reply.code(401).send({ error: "not_authenticated" });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.userId) {
    return reply.code(401).send({ error: "not_authenticated" });
  }
  if (req.userRole !== "admin") {
    reply.code(403).send({ error: "admin_role_required" });
  }
}
