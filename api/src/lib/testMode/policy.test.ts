import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chargeCents,
  effectiveRole,
  guestMailAllowed,
  inTestMode,
  isRealCustomer,
  isTestHost,
  isUndeliverableEmail,
  mayMarkInternal,
  mayMarkTest,
  maySwitchInto,
  mayToggleTestMode,
  splitGuestMail,
  TEST_PRICE_CENTS,
} from "./policy.js";

test("test mode: admins with the switch, and every test host", () => {
  assert.equal(inTestMode({ role: "admin", testAsHost: true }), true);
  assert.equal(inTestMode({ role: "admin", testAsHost: false }), false);
  assert.equal(inTestMode({ role: "host", testAsHost: true }), false, "the flag means nothing on a host");
  assert.equal(inTestMode({ role: "host", testOwnerId: "a1" }), true, "test hosts are always in test mode");
  assert.equal(isTestHost({ testOwnerId: "" }), false);
  assert.equal(isTestHost({ testOwnerId: null }), false);
});

test("host flows see an admin in test mode as a host; admin pages never use this", () => {
  assert.equal(effectiveRole({ role: "admin", testAsHost: true }), "host");
  assert.equal(effectiveRole({ role: "admin" }), "admin");
  assert.equal(effectiveRole({ role: "host" }), "host");
  assert.equal(effectiveRole({ role: "advertiser" }), undefined);
});

test("only admins may toggle test mode", () => {
  assert.equal(mayToggleTestMode("admin"), true);
  assert.equal(mayToggleTestMode("host"), false);
  assert.equal(mayToggleTestMode(undefined), false);
});

test("test price: 50 cents for any paid charge, free stays free", () => {
  assert.equal(chargeCents(500, true), TEST_PRICE_CENTS);
  assert.equal(chargeCents(300, true), 50);
  assert.equal(chargeCents(500, false), 500);
  assert.equal(chargeCents(0, true), 0);
});

test("only the owning admin may switch into a test host", () => {
  assert.equal(maySwitchInto({ actorOwnerId: "a1", target: { testOwnerId: "a1" } }), true);
  assert.equal(maySwitchInto({ actorOwnerId: "a2", target: { testOwnerId: "a1" } }), false);
  assert.equal(maySwitchInto({ actorOwnerId: "a1", target: { testOwnerId: null } }), false, "never into a real account");
  assert.equal(maySwitchInto({ actorOwnerId: "a1", target: null }), false);
});

test(".invalid addresses are undeliverable", () => {
  assert.equal(isUndeliverableEmail("test-ab12@test.rsvpvault.invalid"), true);
  assert.equal(isUndeliverableEmail("someone@gmail.com"), false);
  assert.equal(isUndeliverableEmail(null), false);
});

test("guest mail in test mode reaches ONLY the admin's own address", () => {
  const guard = { testMode: true, safeTo: ["Admin@3PandaLabs.com"] };
  assert.equal(guestMailAllowed(guard, "admin@3pandalabs.com"), true, "case-insensitive");
  assert.equal(guestMailAllowed(guard, "friend@3pandalabs.com"), false, "not the whole domain");
  assert.equal(guestMailAllowed(guard, "realguest@gmail.com"), false);
  assert.equal(guestMailAllowed({ testMode: true, safeTo: [] }, "anyone@x.com"), false, "no safe address = nothing goes");
  assert.equal(guestMailAllowed({ testMode: false, safeTo: [] }, "realguest@gmail.com"), true, "normal hosts unaffected");

  const { send, suppressed } = splitGuestMail(guard, [
    { to: "realguest@gmail.com" },
    { to: "admin@3pandalabs.com" },
    { to: "other@example.com" },
  ]);
  assert.deepEqual(send.map((m) => m.to), ["admin@3pandalabs.com"]);
  assert.deepEqual(suppressed.map((m) => m.to), ["realguest@gmail.com", "other@example.com"]);
});

test("real customers exclude admins, test hosts, internal and marked-test accounts", () => {
  assert.equal(isRealCustomer({ role: "host" }), true);
  assert.equal(isRealCustomer({ role: "admin" }), false);
  assert.equal(isRealCustomer({ role: "host", testOwnerId: "a1" }), false);
  assert.equal(isRealCustomer({ role: "host", isInternal: true }), false);
  assert.equal(isRealCustomer({ role: "host", markedTest: true }), false);
});

test("flags: marked-test only on ordinary hosts; internal never on a test host", () => {
  assert.equal(mayMarkTest({ role: "host" }), true);
  assert.equal(mayMarkTest({ role: "admin" }), false);
  assert.equal(mayMarkTest({ role: "host", testOwnerId: "a1" }), false);
  assert.equal(mayMarkInternal({ role: "admin" }), true);
  assert.equal(mayMarkInternal({ role: "host", testOwnerId: "a1" }), false);
});
