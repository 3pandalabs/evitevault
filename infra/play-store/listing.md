# Play Console: store listing

Everything under **Grow users → Store presence → Main store listing**, plus the app details Play asks for when you create the app. Paste the text inside each code block as is. Character counts are Unicode characters (what Play counts), checked with `node` (see the end).

Default language: **English (United States), en-US**. The site's copy is US English ("color", "favorite") and the publisher is a US LLC. CONFIRM: add an **English (India), en-IN** listing later if India becomes the main market — the templates include Indian weddings and festivals, so the same text works.

## App name (limit 30)

```
RsvpVault: Invitations & RSVP
```

**29 / 30 characters.**

| Name | Characters |
|---|---|
| `RsvpVault: Invitations & RSVP` (chosen) | 29 |
| `RsvpVault: Party Invitations` | 28 |
| `RsvpVault: Digital Invitations` | 30 |
| `RsvpVault` | 9 |

Why: "invitations" and "RSVP" are the two words people search for; the brand comes first. No "free", "best" or "#1" (Play metadata policy). The launcher name on the phone stays `RsvpVault` (`android/twa-manifest.json` → `launcherName`).

## Short description (limit 80)

```
Design digital invitations, share one link, and track every RSVP in one place.
```

**78 / 80 characters.**

## Full description (limit 4000)

```
RsvpVault makes digital invitations simple: design an invitation, share one link, and watch the replies come in.

Planning a birthday party, a wedding, a baby shower, a housewarming, a Diwali dinner or an office get-together? Create the event in a couple of minutes, pick a design, and send the link however your guests already talk to you: WhatsApp, text message, email, or a QR code on a printed card.

YOUR GUESTS NEED NOTHING
Guests don't install an app and don't create an account. They open the link in any browser, see a beautiful invitation page, and reply Going, Maybe or Can't make it in one tap.

EVERY RSVP IN ONE PLACE
• See who's coming, who said maybe, who declined and who hasn't answered yet
• Plus-ones with names, so you know the real headcount
• Optional dietary question for planning food
• Personal messages from guests, visible only to you
• Record replies you got by phone or in person
• RSVP deadline and an optional capacity limit
• Response rate and invitation views at a glance
• Download your guest list as a spreadsheet (CSV)

INVITATIONS THAT LOOK THE PART
• Ready-made designs for birthdays, weddings, baby showers, festivals, housewarmings, parties and business events
• Add your own cover photo
• Design a shareable invitation card image for WhatsApp and social media
• Event date and time shown in the event's own time zone, with Add to calendar
• Map link to the venue

SHARE IT YOUR WAY
• One link for everyone, or a personal link per guest
• Send from your own WhatsApp, messages or email app, so the invitation comes from you
• Printable QR code
• Optional email invitations sent for you

AFTER THE INVITATION
• Guestbook where guests leave wishes and messages, with moderation for you
• Send updates to all guests, or only to those who are coming
• After the event, share a photo album link with everyone who came

PRIVATE BY DESIGN
Every invitation has an unguessable link, and guests' emails and phone numbers are never shown on the invitation page. No ads and no tracking cookies. You can delete any guest, any event, or your whole account at any time from inside the app.

RsvpVault is made by 3PandaLabs. Questions or feedback: support@3pandalabs.com
```

**Count: see the end of this file.**

## App details

| Field | Value |
|---|---|
| App or game | App |
| Free or paid | **Free** (permanent: a free app can never become paid) |
| Category | **Events** |
| Tags | Pick up to 5 of the closest the console offers, e.g. *Event planning*, *Invitations*, *Party planning*, *Calendar*, *Productivity* |
| Contact email | `support@3pandalabs.com` |
| Website | `https://rsvpvault.3pandalabs.com` |
| Phone | leave blank |
| Privacy policy URL | `https://rsvpvault.3pandalabs.com/privacy` |
| Account deletion URL (Data safety) | `https://rsvpvault.3pandalabs.com/delete-account` |

CONFIRM: category **Events** (chosen; it's where "invitation" and "RSVP" apps sit) or **Lifestyle**.

## Graphics

| Asset | File | Spec |
|---|---|---|
| App icon | `graphics/icon-512.png` | 512 × 512, 32-bit PNG, no alpha (Play rounds the corners) |
| Feature graphic | `graphics/feature-graphic.png` | 1024 × 500, PNG, no alpha |
| Phone screenshots | `screenshots/framed/*.png` (captioned) or `screenshots/raw/*.png` | 8 × 1080 × 1920 (9:16) |

See `screenshots.md` for the shot list.

## What's new (release notes for 1.0.0, limit 500)

```
First release of RsvpVault for Android. Design invitations, share one link, and track every RSVP from your phone.
```

## How the counts were checked

```
node -e "for (const s of process.argv.slice(1)) console.log([...s].length, s.slice(0,40))" "RsvpVault: Invitations & RSVP" "Design digital invitations, share one link, and track every RSVP in one place."
```

For the full description, copy the block into a file and run `node -e "console.log([...require('fs').readFileSync(process.argv[1],'utf8').trim()].length)" file.txt`. It is 2,195 characters, well under 4,000.
