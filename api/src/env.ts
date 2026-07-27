import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  PORT: Number(process.env.PORT ?? 8080),
  JWT_SECRET: required("JWT_SECRET"),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Used to build absolute invitation links in announcement emails and in the
  // .ics URL field — the API has no other way to know its own front end.
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3000",

  R2_ACCOUNT_ID: required("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: required("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: required("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET: required("R2_BUCKET"),
  R2_ENDPOINT: required("R2_ENDPOINT"),

  // Salt for the event_views visitor hash. Required: without it the hash would
  // be a plain digest of IP+UA, which is trivially reversible for any given
  // suspect IP and would turn an analytics table into a visitor log.
  ANALYTICS_SALT: required("ANALYTICS_SALT"),

  // Bearer token for the ops-only GET /metrics endpoint. Intentionally NOT
  // required: when unset the route answers 503 and the rest of the API boots
  // normally, so a missing ops secret can't take a deploy down.
  METRICS_TOKEN: process.env.METRICS_TOKEN ?? "",

  // Outbound email for invitations/announcements. Unset in dev (and right now
  // in prod too) — see lib/mailer.ts: sends are logged instead of delivered,
  // and the announcement still records what it would have sent.
  EMAIL_FROM: process.env.EMAIL_FROM ?? "",
  EMAIL_API_URL: process.env.EMAIL_API_URL ?? "",
  EMAIL_API_TOKEN: process.env.EMAIL_API_TOKEN ?? "",
};
