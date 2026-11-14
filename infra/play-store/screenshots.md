# Phone screenshots

Play needs 2–8 phone screenshots: PNG or JPEG, each side 320–3840 px, long side at most twice the short side. For "promotable" placement Google recommends at least 4 at 1080 px or more on the short side, 9:16.

All 16 files here are exactly **1080 × 1920 (9:16)**, so either set can be uploaded as is:

- `screenshots/framed/` — captioned, on the brand's emerald/amber wash. **Recommended.**
- `screenshots/raw/` — plain captures.

Captured on 2026-11-13 from **production** (`https://rsvpvault.3pandalabs.com`) with headless Chromium at a 360 × 640 CSS viewport, device scale 3, Android Chrome user agent, signed in as the Play reviewer account (`app-access.md`).

| # | File | Screen | Caption (`captions.json`) |
|---|---|---|---|
| 1 | `01-landing.png` | Landing page | Digital invitations, every RSVP in one place |
| 2 | `02-dashboard.png` | Your events (one published, one draft) | All your events and replies at a glance |
| 3 | `03-event-overview.png` | Event page: status, date, venue, Preview / Edit / Design card / CSV, invitation link | Share one link by WhatsApp, email or SMS |
| 4 | `04-guest-list.png` | RSVP stats (14 going, 82% response rate) and guest list with statuses | See who's coming, plus-ones and dietary notes |
| 5 | `05-card-designer.png` | Card designer with the exported invitation card | Design a card to send anywhere |
| 6 | `06-invitation.png` | Public invitation `/e/<slug>` (Balloon Pop template) | A beautiful invitation page for every event |
| 7 | `07-rsvp.png` | RSVP form on a guest's personal link | Guests reply in one tap, no app or account |
| 8 | `08-guestbook.png` | Guestbook posts | A guestbook for wishes and messages |

Nothing on screen is real personal data: every name belongs to the demo event, and the reviewer account's email is on the reserved `example.com` domain.

## Recapturing

```
cd infra/play-store/tools
npm install
RSVP_DEMO_EMAIL=play-reviewer@example.com RSVP_DEMO_PASSWORD=<password store> npm run screenshots
npm run frame
```

`capture-screenshots.mjs` only reads: it signs in, opens pages and scrolls. Opening the invitation records a page view (shown on the host's stats) and opening the event marks its responses as seen; it never RSVPs, posts or sends mail. Captions live in `screenshots/captions.json`; keep them to two lines at 72 px (about 45 characters).

## Other form factors

Tablet (7" and 10") and Chromebook screenshots are optional. The site is responsive, so if you want them, add a context with e.g. a 800 × 1280 viewport at scale 2 to `capture-screenshots.mjs`.
