# RsvpVault on Google Play: submission package

Everything needed to publish RsvpVault as an Android app: a **Trusted Web Activity** (TWA) that opens `https://rsvpvault.3pandalabs.com` full screen in the user's Chrome, built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). There is no separate mobile codebase: the app *is* the website, so every web deploy updates the app without a store release.

| | |
|---|---|
| Package id | `com.threepanda.rsvpvault` (same `com.threepanda.*` pattern as BorrowVault's `com.threepanda.borrowvault`) |
| Version | versionName `1.0.0`, versionCode `1` |
| Start URL | `/dashboard` (signed-out hosts are sent to `/login`; see `web/src/app/manifest.ts` for why not `/`) |
| Fallback | Custom Tabs, when the device's browser can't run a TWA |
| Notifications | Off (the site uses no web push) |
| Permissions | None requested. Merged manifest has only the internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no `INTERNET`, no `AD_ID` |
| minSdk / targetSdk | 24 / 36 (android-browser-helper 2.7 needs 24) |
| Upload key | `C:\Users\Anil\Documents\keys\rsvpvault-upload.jks`, alias `upload` (outside the repo; passwords in the 3PandaLabs password store) |
| Upload key SHA-256 | `BE:3B:5F:DC:D0:08:6B:29:C9:BE:E7:E0:EA:63:00:83:EF:D5:55:9F:00:DB:21:68:2B:C2:41:39:1B:34:88:8D` |
| Built AAB | `C:\Users\Anil\Documents\keys\rsvpvault-1.0.0.aab` (signed with the upload key) |
| Sideload APK | `C:\Users\Anil\Documents\keys\rsvpvault-1.0.0.apk` (same key, for testing on a phone before Play) |

| File | What it's for |
|---|---|
| `listing.md` | App name, short and full description, category, contacts, URLs, release notes, with character counts |
| `data-safety.md` | Every Data safety answer, from the code |
| `content-rating.md` | IARC questionnaire, target audience (18+), ads (none), other declarations |
| `app-access.md` | Reviewer account, demo event, and the App access form text |
| `screenshots.md` | Shot list, captions, how to recapture |
| `graphics/icon-512.png` | 512 × 512 hi-res icon, no alpha |
| `graphics/feature-graphic.png` | 1024 × 500 feature graphic |
| `screenshots/framed/`, `screenshots/raw/` | 9 phone screenshots each, 1080 × 1920. Play takes at most 8: upload 02–09 and skip `01-landing` (the feature graphic already carries the branding) |
| `tools/` | `build-graphics.mjs` (Play icon, feature graphic **and** the PWA icons in `web/public/icons/`), `capture-screenshots.mjs`, `frame-screenshots.mjs` |

Lines starting **CONFIRM:** in any file are decisions for the owner; they're collected at the bottom of this page.

## What lives where

- `web/src/app/manifest.ts` → `/manifest.webmanifest` (name, colours, icons, start URL).
- `web/public/icons/` → PWA icons (192/512, "any" and "maskable"). Rendered by `tools/build-graphics.mjs` from the favicon's 💌 emoji, drawn from Google's Noto Emoji SVG (Apache 2.0) so the artwork is licensable.
- `web/src/app/.well-known/assetlinks.json/route.ts` → `/.well-known/assetlinks.json`, `Content-Type: application/json`. A route handler rather than a file in `public/`, so the content type and the dot-directory are guaranteed under OpenNext on Workers. Verified locally with `wrangler dev` on the OpenNext build (200, `application/json`; manifest 200 `application/manifest+json`; icons 200 `image/png`).
- `android/` → Bubblewrap project. `twa-manifest.json` is the source of truth; the Gradle project is generated from it.

## Submission checklist (in order)

### 0. Before anything: deploy the web changes

- [ ] Merge this PR and deploy `web/` (`npm run cf:deploy` per `infra/web-deploy.md`).
- [ ] Check: `curl -sI https://rsvpvault.3pandalabs.com/.well-known/assetlinks.json` → 200, `content-type: application/json`; `curl -s https://rsvpvault.3pandalabs.com/manifest.webmanifest` shows the manifest.
- This PR also fixes a dashboard bug that matters a lot for the app: on any full page load of `/dashboard/...` (a refresh, a bookmark, **or the app opening at its start URL**) a signed-in host was bounced to `/login`, because the layout's redirect effect ran on the hydration pass before the real sign-in state was read (`web/src/app/dashboard/layout.tsx`). Without the fix every app launch would demand a fresh sign-in.

### 1. Developer account

- [ ] The 3PandaLabs **organisation** Play Console account being set up for BorrowVault hosts this app too (developer name **3PandaLabs**). Nothing extra to buy. Organisation accounts skip the 12-tester / 14-day closed-test requirement for new personal accounts.

### 2. Create the app

- [ ] Play Console → **Create app**. Name `RsvpVault: Invitations & RSVP` (`listing.md`), default language English (United States), **App**, **Free**. Tick the declarations.

### 3. Upload the AAB to internal testing

- [ ] **Test and release → Testing → Internal testing → Create new release.**
- [ ] Accept **Play App Signing** (default; Google holds the app signing key, we keep only the upload key).
- [ ] Upload `C:\Users\Anil\Documents\keys\rsvpvault-1.0.0.aab`. Release name `1.0.0 (1)`, notes from `listing.md`.
- [ ] Add testers (your own Google account), save, roll out.

### 4. Copy the Play App Signing SHA-256

- [ ] **Test and release → Setup → App signing** (a.k.a. App integrity → App signing). Copy **App signing key certificate → SHA-256 certificate fingerprint**. (The upload key's fingerprint is shown there too and should match the one above.)

### 5. Add it to assetlinks.json and redeploy the web app

- [ ] In `web/src/app/.well-known/assetlinks.json/route.ts`, add the Play fingerprint as a **second** entry in `SHA256_CERT_FINGERPRINTS`. Keep the upload key's entry: multiple fingerprints are allowed, and the upload key is what signs sideloaded test builds.
- [ ] Also add it to `android/twa-manifest.json` → `fingerprints` as `{ "name": "play", "value": "<sha256>" }` so Bubblewrap tooling knows it.
- [ ] Branch → PR → merge → `npm run cf:deploy`.

Why: users install the copy **Google** re-signed. If assetlinks.json lists only the upload key, Chrome can't verify the app and shows a URL bar at the top, which reviewers reject as a plain "webview wrapper".

### 6. Verify Digital Asset Links

- [ ] Google's verifier (must list the statement with both fingerprints):
  ```
  https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://rsvpvault.3pandalabs.com&relation=delegate_permission/common.handle_all_urls
  ```
- [ ] Install from the internal-testing opt-in link on a real phone. The app must open **without** a URL bar. If you see one: wrong/missing fingerprint, or Cloudflare cached the old file (`Cache-Control: max-age=3600`; wait an hour or purge). Force-stop the app / clear Chrome's data and retry, since Chrome caches the verification.
- [ ] Sign in with the reviewer account, kill the app, reopen: you should land on **Your events**, not Sign in (the layout fix from step 0).

### 7. Store listing and App content forms

- [ ] **Main store listing:** `listing.md` text, `graphics/icon-512.png`, `graphics/feature-graphic.png`, 8 screenshots from `screenshots/framed/` (02–09; skip 01-landing, Play caps phone screenshots at 8).
- [ ] **Store settings:** category Events, tags, contact email `support@3pandalabs.com`, website `https://rsvpvault.3pandalabs.com`.
- [ ] **Privacy policy:** `https://rsvpvault.3pandalabs.com/privacy`.
- [ ] **App access:** `app-access.md`.
- [ ] **Ads:** No.
- [ ] **Content rating:** `content-rating.md`.
- [ ] **Target audience:** 18+ only (`content-rating.md`).
- [ ] **Data safety:** `data-safety.md`, incl. deletion URL `https://rsvpvault.3pandalabs.com/delete-account`.
- [ ] **Government / financial / health / news / COVID:** No / none (`content-rating.md`).
- [ ] **Advertising ID:** No.

### 8. Production

- [ ] Read the internal track's **pre-launch report** (it should get past sign-in with the App access credentials).
- [ ] **Production → Create release → Add from library** (the internal 1.0.0 build). Countries: CONFIRM (suggest United States + India to start). Staged rollout e.g. 20%.
- [ ] Send for review. Answer reviewer email at support@3pandalabs.com quickly. A common TWA rejection is "Minimum functionality / webview"; the defences are a verified TWA (no URL bar), a signed-in reviewer path, and app-like screens — all covered above.

## Rebuilding the Android app (next releases)

Usually you **don't**: content changes ship with the website. Rebuild only to change the package's own properties (name, icon, colours, start URL, version for a Play update, Android target SDK).

Toolchain (already installed on Anil's machine by this PR's build): JDK 17 at `C:\Users\Anil\.bubblewrap\jdk\jdk-17.0.21+9`, Android SDK at `C:\Users\Anil\.bubblewrap\android_sdk` (build-tools 36.1.0, platform 36), recorded in `C:\Users\Anil\.bubblewrap\config.json`.

1. Edit `android/twa-manifest.json`: bump `appVersionCode` (must increase every upload) and `appVersionName`.
2. `cd android && npx @bubblewrap/cli update` (regenerates the Gradle project from the manifest; answer the prompts).
3. Build. Either `npx @bubblewrap/cli build` with `BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD` set, or — what this PR did, because Bubblewrap's `gradlew.bat` call failed in this shell — Gradle directly plus `jarsigner` (PowerShell):
   ```
   $env:JAVA_HOME="C:\Users\Anil\.bubblewrap\jdk\jdk-17.0.21+9"; $env:ANDROID_HOME="C:\Users\Anil\.bubblewrap\android_sdk"
   cd android; .\gradlew.bat bundleRelease
   Copy-Item app\build\outputs\bundle\release\app-release.aab ..\..\keys\rsvpvault-<version>.aab
   & "$env:JAVA_HOME\bin\jarsigner" -keystore ..\..\keys\rsvpvault-upload.jks -sigalg SHA256withRSA -digestalg SHA-256 ..\..\keys\rsvpvault-<version>.aab upload
   & "$env:JAVA_HOME\bin\keytool" -printcert -jarfile ..\..\keys\rsvpvault-<version>.aab   # SHA256 must be BE:3B:5F:...:88:8D
   ```
4. Upload to internal testing, then promote.

Generation note: the project was generated non-interactively with `@bubblewrap/core` 1.27.0 `TwaGenerator` (icons served from `web/public/icons/` before they were live), then `twa-manifest.json` was pointed at the production icon/manifest URLs, `minSdkVersion` raised to 24, and `manifest-checksum.txt` written so `bubblewrap build` doesn't prompt.

**Never lose the upload key.** If it's lost, Play support can reset the upload key (Play App Signing keeps the real signing key), but it takes days. Back up `rsvpvault-upload.jks` and its password together in the password store.

## All CONFIRM items

From `listing.md`:
- Default listing language en-US (chosen) vs en-IN; add en-IN later?
- Category: Events (chosen) or Lifestyle.

From `data-safety.md`:
- Declare *Address* (venue may be a home) — conservative option.
- Email purposes: App functionality + Account management only, or also Developer communications.
- Also tick *Fraud prevention, security, and compliance* for server logs?

From `content-rating.md`:
- IARC category: Utility/Productivity/Communication/Other (chosen) or Social/UGC.
- Alcohol "references" answer given the *Cocktail Noir* template name.
- Comfortable with a children's-birthday demo theme in the screenshots (app audience is still 18+)?
- The actual rating certificate once issued.

From `app-access.md`:
- Store the reviewer password in the password store under "RsvpVault — Play reviewer".

From this README:
- Countries for the first production rollout (suggest US + India).
- Staged rollout percentage.
- Upload-key and keystore password backed up in the password store.
