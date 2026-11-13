# Play Console: Data safety

**Policy → App content → Data safety.** Answers are derived from the code: `api/src/db/schema.ts` (what's stored), `api/src/routes/*` (what's collected and sent), `api/src/lib/analytics.ts` (page views), and the Privacy Policy (`web/src/app/privacy/page.tsx`). Re-check them whenever the schema or a route changes.

The Android app is a Trusted Web Activity: it shows `https://rsvpvault.3pandalabs.com` full screen in the user's Chrome. It contains **no SDKs** beyond `androidx.browser` / `android-browser-helper` (no analytics, ads, crash reporting or Firebase) and requests **no runtime permissions**. All data below is collected by the website the app displays, which Play counts as collected by the app.

## Overview questions

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Host accounts, events and guest lists. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | HTTPS only (Cloudflare edge; the API is reachable only through Cloudflare or over TLS on the DNS-only internal host). |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In-app: dashboard header → **Delete account** (`/delete-account`, `POST /me/delete`). Web URL below. |
| Account deletion URL | `https://rsvpvault.3pandalabs.com/delete-account` | Signed-in self-serve deletion; signed-out visitors see how deletion works and the support address. |
| Does the app allow users to create an account? | **Yes**, email + password (no third-party sign-in). | `POST /auth/register` |

"Shared" in Play's sense means transferred to a third party. Our processors (Cloudflare, Hetzner, Resend) act on our behalf, which Play treats as **not shared** ("service providers"). Showing a guest's RSVP to the host who invited them is the app's core function between its own users, not sharing with a third party. So every row below is **Collected: yes / Shared: no**.

## Data types

### Personal info

| Type | Collected | Shared | Optional? | Purposes | Source in code |
|---|---|---|---|---|---|
| **Name** | Yes | No | Host display name optional; guest names required to add a guest / sign the guestbook | App functionality, Account management | `users.display_name`, `events.host_display_name`, `guests.name`, `guests.plus_one_names`, `guestbook_posts.author_name` |
| **Email address** | Yes | No | Required for hosts; optional for guests entered by a host; required for an open (link-only) RSVP | App functionality, Account management, Developer communications (password reset, invitation and RSVP-confirmation emails) | `users.email`, `guests.email`, `guestbook_posts.author_email` |
| **Phone number** | Yes | No | Optional (a host may add one for a guest) | App functionality | `guests.phone` |
| **Other info** | Yes | No | Optional | App functionality | `guests.dietary_notes` (free text the host asked for) |
| Address, race/ethnicity, political or religious beliefs, sexual orientation, user IDs from other services | No | | | | Event location is the venue, not the user's address. CONFIRM: if you prefer to be conservative, declare *Address* as optional App functionality because a host can put their home as the venue. |

CONFIRM — "Developer communications" vs only "App functionality" for email: the emails we send are all transactional (password reset, invitations and announcements the host asked to send, RSVP confirmations). No newsletters or marketing. "App functionality" + "Account management" is enough; add "Developer communications" only if you'd rather over-declare.

### Messages

| Type | Collected | Shared | Optional? | Purposes | Source |
|---|---|---|---|---|---|
| **Other in-app messages** | Yes | No | Optional | App functionality | Guest's message to the host on an RSVP (`guests.message`), guestbook posts (`guestbook_posts.body`), host announcements to guests (`announcements.subject/body`) |
| Emails, SMS | No | | | | We send email, but we don't read the user's own mailbox or texts. Share buttons hand text to the user's WhatsApp/SMS/mail app; nothing is collected. |

### Photos and videos

| Type | Collected | Shared | Optional? | Purposes | Source |
|---|---|---|---|---|---|
| **Photos** | Yes | No | Optional | App functionality | Event cover image and exported invitation card (`events.cover_image_key`, `card_image_key`), guestbook photos (`guestbook_posts.image_key`), stored in Cloudflare R2 (`evitevault-media`), served only through short-lived presigned URLs. Uploaded through the browser's file picker; the app requests no storage or camera permission. |
| Videos | No | | | | |

### App activity

| Type | Collected | Shared | Optional? | Purposes | Source |
|---|---|---|---|---|---|
| **Other user-generated content** | Yes | No | Required to use the app | App functionality | Events (title, description, date, venue, map link, design choices), saved templates, RSVP answers and plus-one counts, RSVP history (`rsvp_log`) |
| **App interactions** | Yes | No | Not optional (automatic) | Analytics (shown to the host) | Invitation page views: one row per view with a **salted one-way hash of IP + user agent**, the event, and the guest if they used a personal link (`event_views`, `api/src/lib/analytics.ts`). Also `guests.first_viewed_at` / `last_viewed_at`. The IP itself is never stored. |
| In-app search history, installed apps, web browsing history | No | | | | No search feature; the app never sees other sites. |

Ephemeral processing note: Play allows marking data processed only in memory as not collected. The page-view hash is stored, so it is declared above. Server request logs (Fastify `logger: true`, kept briefly, Privacy Policy section 7) contain IPs and URLs; they're used only for operations and security, which Play doesn't require declaring as a separate type, but **App interactions → Analytics** already covers them conservatively. CONFIRM if you'd rather also tick *Fraud prevention, security, and compliance* for that row.

### Device or other IDs, location, financial, health, contacts, calendar, files, audio

**Not collected.** No advertising ID (no ads or analytics SDK; the TWA template doesn't include `AD_ID`). No location permission. No payments (the app is free with no in-app purchases). "Add to calendar" downloads an `.ics` the user opens themselves; we never read their calendar. No contacts access: guests are typed or pasted in by the host.

### App info and performance

| Type | Collected | Why |
|---|---|---|
| Crash logs | **No** | No crash reporting (no Sentry, Crashlytics or Firebase). Play Console's own Android vitals are collected by Google, not by us, and aren't declared. |
| Diagnostics | No | |

## Security practices section

- **Data is encrypted in transit:** Yes.
- **You can request that data be deleted:** Yes (account deletion URL above; guests can ask the host or email support@3pandalabs.com, Privacy Policy section 8).
- **Committed to Play Families Policy:** No (not a children's app; see `content-rating.md`).
- **Independent security review:** No.

## Data about guests (people without an account)

Guests are not app users in the account sense, but their data is collected through the app, so it's included above: name, optional email and phone (entered by the host), RSVP, plus-one names, dietary notes, message, guestbook posts and photos. Deleting a guest, the event, or the host account deletes it (`ON DELETE CASCADE` throughout `schema.ts`; R2 objects under `events/<id>/` are swept after an account deletion).

## What happens on account deletion

`POST /me/delete` (password re-confirmation) deletes, in one transaction: the host, their events, all guests, RSVP history, guestbook posts, announcements, page views, saved templates, sessions and reset tokens; then sweeps the event images from R2. Database backups roll off on their normal schedule (Privacy Policy section 7). Matches what `/delete-account` tells the user.
