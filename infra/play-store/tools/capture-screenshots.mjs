// Captures the Play listing's phone screenshots from PRODUCTION, signed in as
// the Play reviewer demo host (see ../app-access.md for the account and the
// demo event). Output is exactly 1080 x 1920: a 360 x 640 CSS viewport at
// device scale 3, i.e. a 9:16 phone, which Play accepts as-is.
//
//   cd infra/play-store/tools && npm install
//   RSVP_DEMO_EMAIL=... RSVP_DEMO_PASSWORD=... npm run screenshots
//   npm run frame        # optional captioned versions
//
// Read-only against the API apart from what any visitor does: opening the
// invitation page records a page view, and opening the event as its host marks
// its responses seen. Nothing here RSVPs, posts or sends mail.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = process.env.RSVP_SITE ?? "https://rsvpvault.3pandalabs.com";
const API = process.env.RSVP_API ?? "https://api.rsvpvault.3pandalabs.com";
const EMAIL = process.env.RSVP_DEMO_EMAIL;
const PASSWORD = process.env.RSVP_DEMO_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("Set RSVP_DEMO_EMAIL and RSVP_DEMO_PASSWORD");

const OUT = fileURLToPath(new URL("../screenshots/raw/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const { accessToken } = await login.json();
const auth = { authorization: `Bearer ${accessToken}` };

const { events } = await (await fetch(`${API}/events`, { headers: auth })).json();
const party = events.find((e) => e.status === "published");
if (!party) throw new Error("demo account has no published event — see ../app-access.md");
const { guests } = await (await fetch(`${API}/events/${party.id}/guests`, { headers: auth })).json();
const pending = guests.find((g) => g.rsvpStatus === "pending");

// Dashboard pages are reached by clicking the app's own links after signing
// in through the form, not by loading their URLs directly: a client-side
// navigation is what a host actually does, and it works on deployments that
// predate the dashboard-layout hydration fix (see web/src/app/dashboard/layout.tsx).
//
// [file, how to get there, where to scroll: { text, nth: "first"|"last", above } or { px }]
const eventHref = `/dashboard/events/${party.id}`;
const SHOTS = [
  ["01-landing.png", { url: "/" }],
  ["02-dashboard.png", { dashboard: [] }],
  ["03-event-overview.png", { dashboard: [eventHref] }],
  ["04-guest-list.png", { dashboard: [eventHref] }, { text: "Guest list", nth: "first", above: 330 }],
  ["05-card-designer.png", { dashboard: [eventHref, `${eventHref}/design`] }, { px: 250 }],
  ["06-invitation.png", { url: `/e/${party.slug}` }],
  ["07-rsvp.png", { url: `/e/${party.slug}?t=${pending.inviteToken}` }, { text: "Will you be there", nth: "first", above: 120 }],
  // Past the post form, to the messages themselves (newest first).
  ["08-guestbook.png", { url: `/e/${party.slug}` }, { text: "The Johnson family", nth: "last", above: 140 }],
  // The album link the host shares after the day, as guests see it: they add their own photos to it.
  ["09-photo-album.png", { url: `/e/${party.slug}` }, { text: "The pictures from the day", nth: "first", above: 90 }],
];

const browser = await chromium.launch();
for (const [file, how, scroll] of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  if (how.dashboard) {
    await page.goto(SITE + "/login", { waitUntil: "networkidle" });
    await page.fill("input[type=email]", EMAIL);
    await page.fill("input[type=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard");
    for (const href of how.dashboard) {
      await page.waitForSelector(`a[href="${href}"]`);
      await page.click(`a[href="${href}"]`);
      await page.waitForURL("**" + href);
    }
    await page.waitForLoadState("networkidle");
  } else {
    await page.goto(SITE + how.url, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(2500); // fonts, confetti, client fetches
  if (scroll?.px) {
    await page.evaluate((px) => window.scrollBy(0, px), scroll.px);
    await page.waitForTimeout(800);
  } else if (scroll?.text) {
    const all = page.getByText(scroll.text, { exact: false });
    const target = scroll.nth === "last" ? all.last() : all.first();
    if (await target.count()) {
      await target.evaluate((el, px) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -px);
      }, scroll.above ?? 16);
      await page.waitForTimeout(800);
    } else {
      console.warn(`  "${scroll.text}" not found for ${file}`);
    }
  }
  await page.screenshot({ path: OUT + file });
  console.log(file);
  await ctx.close();
}
await browser.close();
