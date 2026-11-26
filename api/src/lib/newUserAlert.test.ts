import { test } from "node:test";
import assert from "node:assert/strict";
import { newUserAlertTo, newUserMail, notifyNewUser, type AlertMailer } from "./newUserAlert.js";
import type { Mail } from "./mailer.js";

const ok = { delivered: 1, failed: 0, skipped: 0, failedRecipients: [], quotaExhausted: false };

test("recipient defaults to the org inbox, honours override and 'off'", () => {
  assert.equal(newUserAlertTo(undefined), "3pandas@3pandalabs.com");
  assert.equal(newUserAlertTo("  "), "3pandas@3pandalabs.com");
  assert.equal(newUserAlertTo(" ops@example.com "), "ops@example.com");
  assert.equal(newUserAlertTo("OFF"), null);
});

test("mail has the exact subject, a text part, and escapes user text", () => {
  const m = newUserMail("to@example.com", {
    email: "a@b.co",
    userId: "u-1",
    displayName: "<b>Eve</b>\r\nBcc: x",
    at: new Date("2026-11-26T09:05:00Z"),
  });
  assert.equal(m.subject, "RsvpVault New user");
  assert.equal(m.to, "to@example.com");
  assert.match(m.text, /Email: a@b\.co/);
  assert.match(m.text, /Name: <b>Eve<\/b> Bcc: x/);
  assert.match(m.text, /Signed up: 2026-11-26 09:05 UTC/);
  assert.match(m.text, /User id: u-1/);
  assert.match(m.html, /&lt;b&gt;Eve&lt;\/b&gt;/);
  assert.doesNotMatch(m.html, /<b>Eve/);
});

test("no name row when the sign-up has no display name", () => {
  const m = newUserMail("to@example.com", { email: "a@b.co", userId: "u-1" });
  assert.doesNotMatch(m.text, /Name:/);
});

test("notify sends one mail to the default inbox", async () => {
  const sent: Mail[] = [];
  const mailer: AlertMailer = { configured: () => true, send: async (ms) => (sent.push(...ms), ok) };
  delete process.env.NEW_USER_ALERT_EMAIL;
  notifyNewUser({ email: "a@b.co", userId: "u-1" }, mailer, () => {});
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "3pandas@3pandalabs.com");
});

test("notify sends nothing when off or mailer unconfigured", async () => {
  let calls = 0;
  const send = async () => (calls++, ok);
  process.env.NEW_USER_ALERT_EMAIL = "off";
  notifyNewUser({ email: "a@b.co", userId: "u-1" }, { configured: () => true, send }, () => {});
  delete process.env.NEW_USER_ALERT_EMAIL;
  notifyNewUser({ email: "a@b.co", userId: "u-1" }, { configured: () => false, send }, () => {});
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
});

test("notify never throws and only logs when the send fails", async () => {
  const logs: string[] = [];
  const rejecting: AlertMailer = { configured: () => true, send: () => Promise.reject(new Error("boom")) };
  const throwing: AlertMailer = {
    configured: () => true,
    send: () => {
      throw new Error("sync boom");
    },
  };
  assert.doesNotThrow(() => notifyNewUser({ email: "a@b.co", userId: "u-1" }, rejecting, (m) => logs.push(m)));
  assert.doesNotThrow(() => notifyNewUser({ email: "a@b.co", userId: "u-1" }, throwing, (m) => logs.push(m)));
  await new Promise((r) => setImmediate(r));
  assert.equal(logs.length, 2);
  assert.ok(logs.every((l) => l.startsWith("new user alert failed")));
});
