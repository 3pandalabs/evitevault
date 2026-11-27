import { test } from "node:test";
import assert from "node:assert/strict";
import { featureMode, isEnabled, videoInvitesVisibleTo } from "./policy.js";

const admin = { realAdmin: true, adminTestHost: false };
const adminTestHost = { realAdmin: false, adminTestHost: true };
const host = { realAdmin: false, adminTestHost: false };

test("VIDEO_INVITES parses to on / admins / off", () => {
  assert.equal(featureMode("on"), "on");
  assert.equal(featureMode(" ADMINS "), "admins");
  assert.equal(featureMode(""), "off");
  assert.equal(featureMode(undefined), "off");
  assert.equal(featureMode("true"), "off");
  assert.equal(featureMode("admin"), "off", "only the exact word");
});

test("the job and the public page run in on and admins, not off", () => {
  assert.equal(isEnabled("on"), true);
  assert.equal(isEnabled("admins"), true);
  assert.equal(isEnabled("off"), false);
  assert.equal(isEnabled(undefined), false);
});

test("on: everyone sees it", () => {
  assert.equal(videoInvitesVisibleTo("on", host), true);
  assert.equal(videoInvitesVisibleTo("on", admin), true);
});

test("admins + a real admin: visible", () => {
  assert.equal(videoInvitesVisibleTo("admins", admin), true);
});

test("admins + a test host owned by a real admin: visible", () => {
  assert.equal(videoInvitesVisibleTo("admins", adminTestHost), true);
});

test("admins + a normal host: hidden, exactly like off", () => {
  assert.equal(videoInvitesVisibleTo("admins", host), false);
});

test("off: nobody, admins included", () => {
  assert.equal(videoInvitesVisibleTo("off", admin), false);
  assert.equal(videoInvitesVisibleTo("off", adminTestHost), false);
  assert.equal(videoInvitesVisibleTo("off", host), false);
});
