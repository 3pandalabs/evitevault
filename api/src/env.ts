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

  // Outbound email goes through the shared org gateway (3pandalabs/mailer), a
  // Cloudflare Worker using the send_email binding. Deliberately NOT a
  // Cloudflare API token: the binding authenticates implicitly, so no provider
  // credential exists in this app's environment at all. MAILER_TOKEN grants
  // exactly one capability — send as evitevault's configured sender.
  //
  // Both optional. Unset means sends are logged and counted as skipped rather
  // than throwing: guests are already saved by then, and losing a host's guest
  // list to a missing ops secret would be a far worse failure than an
  // undelivered invitation. See lib/mailer.ts.
  MAILER_URL: process.env.MAILER_URL ?? "",
  MAILER_TOKEN: process.env.MAILER_TOKEN ?? "",
  // Display name only. The from ADDRESS lives in the gateway's APP_SENDERS, so
  // it isn't duplicated here and can't drift.
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME ?? "EviteVault",
};
