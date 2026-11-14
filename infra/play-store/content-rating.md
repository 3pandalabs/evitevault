# Play Console: content rating, target audience, ads, other declarations

## Content rating (IARC questionnaire)

**Policy → App content → Content rating → Start questionnaire.**

Email for the IARC certificate: `support@3pandalabs.com`.

### Category

Options: Game; Social Networking, Forums, Blogs and UGC Sharing; Reference, News or Educational; Consumer Store or Commercial Streaming; Entertainment; **Utility, Productivity, Communication or Other**.

Suggested: **Utility, Productivity, Communication, or Other.** RsvpVault is an event-planning tool: a host makes an invitation and collects replies from people they invited. There's no public feed, no profiles, no discovery of strangers, and every invitation is reachable only by its unguessable link.

It does have user-generated content (guestbook posts with optional photos, RSVP messages, host-written invitations), so answer every interaction question **Yes** honestly. CONFIRM: if you'd rather be maximally conservative, choose *Social Networking, Forums, Blogs and UGC Sharing*; the answers below are the same either way.

### Answers

| Topic | Answer | Reasoning |
|---|---|---|
| Violence, blood, gore | No | No such content from us. |
| Fear / horror | No | |
| Sexuality, nudity | No | |
| Language (profanity, crude humour) | No | No such content from us; user text is covered by the interaction questions. |
| Controlled substances (drugs, alcohol, tobacco) | No | Templates have no alcohol imagery. CONFIRM: the *Cocktail Noir* template's name mentions cocktails but shows only stripes; if the questionnaire asks about *references* to alcohol, "No" is still accurate for content we supply. |
| Gambling (simulated or real money), loot boxes | No | |
| Discrimination / hate | No | |
| **Can users interact or exchange content?** | **Yes** | Guests post to an event guestbook (text + optional photo) visible to everyone with the invitation link; guests send RSVP messages to the host; hosts send announcements to guests. |
| Is user content moderated? | Yes, by the host | The host can hide or delete any guestbook post (`PATCH/DELETE /events/:id/guestbook/:postId`) and can turn the guestbook and guest photos off per event. No automated filtering. |
| **Does the app share the user's current physical location with other users?** | **No** | No location access at all. The venue address is something the host types for the event. |
| Does the app allow users to purchase digital goods? | No | Free, no in-app purchases. |
| Unrestricted internet access | No | The app is our own website. Links to other sites (map links, a photo album link, wa.me share links) open in the browser or the relevant app, not in a general-purpose browser inside ours. |
| Does the app contain ads? | No | |

### Expected rating

- IARC generic: **3+** (or **Everyone**), with the interactive element **"Users Interact"** (and possibly "Shares Info" is *not* expected: no location sharing).
- ESRB: Everyone, Users Interact. PEGI 3. USK 0.

CONFIRM: the actual certificate after you submit.

## Target audience and content

**Policy → App content → Target audience and content.**

| Question | Answer |
|---|---|
| Target age groups | **18 and over** only. Leave every younger band unticked. |
| Could the app unintentionally appeal to children? | **No.** Host accounts are for adults (Terms: "You must be at least 18 to create a host account"; Privacy Policy section 10). The design is a plain utility. |
| Store listing appeals to children? | No. The demo screenshots show a children's birthday party being planned by parents; the app's user is the parent. CONFIRM you're comfortable with that demo theme — if Play pushes back, swap the demo event for an adult birthday or a housewarming and rerun `tools/capture-screenshots.mjs`. |

Guests may include children (e.g. a birthday invitation), but guests don't use the app: they open a web link, have no account, and the host enters their details. Because the target audience excludes under-13s, the Families policy and its SDK requirements don't apply.

## Ads

**Policy → App content → Ads:** **No, my app does not contain ads.**

## Other App content declarations

| Declaration | Answer |
|---|---|
| Government app | No |
| Financial features | "My app doesn't provide any financial features" |
| Health | No health features |
| News app | No |
| COVID-19 contact tracing / status | No |
| Advertising ID | **No** — the app doesn't use the advertising ID (no ads or analytics SDK). Verify after building: `bundletool dump manifest --bundle app-release-signed.aab` must not list `com.google.android.gms.permission.AD_ID`. |
| Photo and video permissions | Not applicable: the app declares none (uploads go through the browser's file chooser). |
| Foreground service, exact alarm, location, SMS/call log, accessibility, VPN | None declared. |
| Data safety | See `data-safety.md` |
