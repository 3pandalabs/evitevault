import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export type UserRole = "host" | "admin";
export type AccessTokenPayload = { sub: string; role: UserRole };

const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

// A preview token lets an unauthenticated request see ONE unpublished event,
// briefly. It exists because a draft invitation has no other way to be looked
// at as a guest would see it: the public route serves published events only,
// and the host dashboard renders nothing like the real page.
//
// Scoped to a single event id and typed, so an access token can never be
// presented as a preview token or the reverse. Two hours because it is meant to
// be clicked immediately from the dashboard, not bookmarked or shared — and if
// it does leak, it expires long before the event does.
const PREVIEW_TOKEN_TTL = "2h";
type PreviewTokenPayload = { eventId: string; typ: "preview" };

export function signPreviewToken(eventId: string): string {
  return jwt.sign({ eventId, typ: "preview" } satisfies PreviewTokenPayload, env.JWT_SECRET, {
    expiresIn: PREVIEW_TOKEN_TTL,
  });
}

export function verifyPreviewToken(token: string): PreviewTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Partial<PreviewTokenPayload>;
    if (payload.typ !== "preview" || typeof payload.eventId !== "string") return null;
    return { eventId: payload.eventId, typ: "preview" };
  } catch {
    // Expired or forged. The caller treats this exactly like no token at all,
    // so a draft stays a 404 rather than admitting it exists.
    return null;
  }
}

// Refresh tokens are `${sessionId}.${secret}` — sessionId is a safe-to-expose
// lookup key (indexed row id), secret is what actually authenticates and only
// its bcrypt hash is stored. This lets refresh/logout find the candidate
// session with an indexed lookup instead of bcrypt-comparing every session row.
export function generateRefreshSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const idx = token.indexOf(".");
  if (idx < 0) return null;
  return { sessionId: token.slice(0, idx), secret: token.slice(idx + 1) };
}
