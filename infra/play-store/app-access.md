# Play Console: App access (reviewer login)

**Policy → App content → App access → "All or some functionality in my app is restricted".**

Everything a host does needs a sign-in, so Play's reviewers (and the automated pre-launch report) need working credentials. Guests' pages (`/e/<slug>`) don't.

## The demo / reviewer account (exists in production)

| | |
|---|---|
| Email | `play-reviewer@example.com` |
| Password | see 3PandaLabs password store (entry "RsvpVault — Play reviewer") |
| Display name | Maya Patel |
| Created | 2026-11-13, through the normal `POST /auth/register` (no email is sent on sign-up) |

`example.com` is reserved (RFC 2606) and can never receive mail, which is the point: nothing this account does can email anyone, and "Forgot password" for it goes nowhere. If the password is ever lost, reset it directly in the `evitevault` database or recreate the account.

**Keep this account.** Deleting it (or its events) breaks review of every future release, and the screenshots are captured from it.

### What's in it

1. **Leo's 7th Birthday Party** — published, Sat 12 Dec 2026 3–6 PM ET, Funtime Play Café, Montclair NJ, *Balloon Pop* template, dietary question on, plus-ones up to 3, invitation-only (open RSVP off).
   - Public link: `https://rsvpvault.3pandalabs.com/e/9aa3c4c1-5411-4409-aa2c-1827bbc2995b`
   - 11 guests, **none with an email or phone**: 6 attending (14 people with plus-ones), 2 maybe, 1 declined, 2 pending. RSVPs were recorded by the host (`PATCH`), not through the public form, so no confirmation emails exist to send.
   - 3 guestbook posts.
2. **Housewarming Brunch** — draft, Sun 17 Jan 2027.

Rerunnable seed: the script used is summarised in the PR; re-creating it means registering, creating the event from the *balloon-pop* template, publishing, adding name-only guests with `sendInvites: false`, setting statuses with `PATCH /events/:id/guests/:guestId`, and posting guestbook entries with each guest's invite token.

### Why nothing can be emailed from it

- Sign-up sends nothing (`api/src/routes/auth.ts`).
- Publishing sends nothing (`POST /events/:id/publish`, see its comment).
- Invitation emails go only to guests **with an address** (`sendInvitations`, `jobs/pendingInvitations.ts`). These guests have none.
- RSVP confirmations go only to a guest's address; the public form requires one, which is why demo RSVPs were set by the host instead.
- Announcements and "share photo album" mail guests with addresses only — none here.

A reviewer *can* add a guest with a real email and press send. That's the product working; the daily mail quota still applies.

## Text for the App access form

Name: `Reviewer host account`

Username: `play-reviewer@example.com`

Password: *(from the password store)*

Any other information required to access your app:

```
RsvpVault is for event hosts. The app opens on Sign in; use the credentials above. In "Your events" open "Leo's 7th Birthday Party" for the guest list with RSVP statuses, sharing and "Design card". "Preview" shows the invitation as guests see it, with the RSVP form and guestbook. Guests need no account. To test deletion, create a new account ("Need an account?") and use "Delete account". Please don't delete this reviewer account.
```

(433 characters; the box allows 500.)

CONFIRM: store the password in the 3PandaLabs password store under "RsvpVault — Play reviewer" (it's in the PR handoff, not in the repo).
