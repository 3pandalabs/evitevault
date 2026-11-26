import type { Mail, SendResult } from "./mailer.js";

// "RsvpVault New user" email to the org inbox whenever a host signs up
// (2026-11-26, owner request; same shape as AdVault's lib/newUserAlert.ts).
//
// The only place a user row is created is POST /auth/register, and it alerts
// only when the insert actually created a row: an existing email (conflict)
// returns no row and sends nothing. The seed (db/seed.ts) creates templates,
// never users, and no migration inserts users — so nothing else can alert.
//
// Fire-and-forget: never awaited by the sign-up, never throws into it; a send
// failure only logs. NEW_USER_ALERT_EMAIL overrides the recipient; "off" turns
// the alert off. It goes through the same shared gateway as invitations, so it
// is sent from this app's configured sender (invitations@rsvpvault.3pandalabs.com)
// and counts one message against the daily allowance.
//
// Deliberately imports nothing that reads env.ts, so it is unit-testable
// without the API's required secrets; the caller passes the mailer in.

export function newUserAlertTo(raw: string | undefined = process.env.NEW_USER_ALERT_EMAIL): string | null {
  const v = raw?.trim();
  if (v?.toLowerCase() === "off") return null;
  return v || "3pandas@3pandalabs.com";
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 200);

export type NewUser = { email: string; userId: string; displayName?: string | null; at?: Date };

export function newUserMail(to: string, u: NewUser): Mail {
  const at = (u.at ?? new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const name = u.displayName ? oneLine(u.displayName) : "";
  const rows: [string, string][] = [
    ["App", "RsvpVault"],
    ["Email", u.email],
    ...(name ? ([["Name", name]] as [string, string][]) : []),
    ["Signed up", at],
    ["User id", u.userId],
  ];
  return {
    to,
    subject: "RsvpVault New user",
    text: `New RsvpVault sign-up.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px">
  <p style="font-size:15px"><b>New RsvpVault sign-up</b></p>
  <table style="font-size:14px;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#6b7280;padding:2px 12px 2px 0">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("")}</table>
</div>`,
  };
}

export type AlertMailer = {
  configured: () => boolean;
  send: (messages: Mail[], log: (msg: string) => void) => Promise<SendResult>;
};

/** Sends the alert in the background. Never throws, never awaited by the sign-up. */
export function notifyNewUser(u: NewUser, mailer: AlertMailer, log: (msg: string) => void): void {
  try {
    const to = newUserAlertTo();
    if (!to || !mailer.configured()) return;
    void mailer
      .send([newUserMail(to, u)], log)
      .then((r) => {
        if (!r.delivered) log(`new user alert not delivered (failed ${r.failed}, skipped ${r.skipped})`);
      })
      .catch((err) => log(`new user alert failed: ${String(err)}`));
  } catch (err) {
    log(`new user alert failed: ${String(err)}`);
  }
}
