# Email sending — NOT YET CONFIGURED

**Status: deferred (2026-07-27).** The code is written, merged and deployed; the
provider is not wired up. Until the steps below are done, invitation and
announcement sends are logged and counted as skipped, and the dashboard says so
explicitly rather than implying mail went out.

Nothing is broken in the meantime — hosts share the invitation link or its QR
code, and guests RSVP normally. Email is an addition, not a dependency.

## What already exists in code

| Piece | Where |
|---|---|
| Cloudflare Email Sending REST client | `api/src/lib/mailer.ts` |
| Invitation template (HTML + text, inline QR) | `api/src/lib/emails/invitation.ts` |
| Server-side QR rendering | `api/src/lib/qr.ts` |
| Send on guest add | `api/src/routes/guests.ts` |
| Re-send to non-responders | `POST /events/:id/guests/send-invitations` |
| Announcement sends | `api/src/routes/announcements.ts` |

`mailerConfigured()` gates all of it. Unset config is a skip, never a throw —
guests are already saved by that point, and losing a host's guest list to a
missing ops secret would be a far worse failure than an undelivered invitation.

## Current DNS (checked 2026-07-27)

```
3pandalabs.com   MX   → route1/2/3.mx.cloudflare.net   (Email Routing, live)
3pandalabs.com   TXT  → v=spf1 include:_spf.mx.cloudflare.net ~all
_dmarc.3pandalabs.com → (none)
```

## Decide first: which domain sends

**Recommended: `evitevault.3pandalabs.com`**, giving
`invitations@evitevault.3pandalabs.com`.

EviteVault mails guests who never signed up with 3PandaLabs — people who will
occasionally mark an invitation from an unfamiliar domain as spam. On a
subdomain that reputation damage is contained; on the apex it degrades the
domain the company's real email flows through. The subdomain already exists as
a Worker custom domain, and SPF/DKIM are TXT/CNAME records, so they don't
disturb that.

If the dashboard won't let you onboard a subdomain, the apex works — Cloudflare
merges the existing SPF record itself.

## Steps

### 1. Onboard the sending domain

```bash
npx wrangler email sending enable evitevault.3pandalabs.com
npx wrangler email sending dns get evitevault.3pandalabs.com   # confirm SPF + DKIM
```

Dashboard equivalent: **Compute & AI → Email Service → Email Sending → Onboard
Domain → Add records and onboard.** Auto-adds SPF (TXT) and DKIM (CNAME/TXT);
propagation is usually 5–15 minutes.

### 2. API token

**Cloudflare → My Profile → API Tokens → Create Token → Create Custom Token**

- Permissions: **Account → Email Sending → Edit**
- Account resources: `f688cc57abfb9e1ef72a57f4841e0e73`
- No TTL; record the creation date in `knowledge_base/tech-stack.md` so it can
  be rotated later.

Note: a normal `wrangler login` OAuth session does **not** carry the email
scope — `wrangler email sending list` returns `Unauthorized [code: 2036]`. This
token is separate.

### 3. Test before wiring the app

```bash
npx wrangler email send \
  --from invitations@evitevault.3pandalabs.com \
  --to <a real address you control> \
  --subject "EviteVault test" \
  --text "Testing Email Sending."
```

If this doesn't arrive, stop — the app cannot do better than the provider.

### 4. Coolify env on `evitevault-api`, then redeploy

```
EMAIL_FROM=invitations@evitevault.3pandalabs.com
EMAIL_FROM_NAME=EviteVault
EMAIL_ACCOUNT_ID=f688cc57abfb9e1ef72a57f4841e0e73
EMAIL_API_TOKEN=<from step 2>          # mark secret
```

### 5. Verify

Add a guest with your own address to a published event. Expect the invitation
with the QR inline, and the dashboard to report "Added 1. Emailed 1." instead
of the "email isn't set up" message.

## Also worth doing at the same time

There is **no DMARC record** on `3pandalabs.com`. Without one, receivers have no
instruction for mail that fails authentication, which hurts inbox placement. Add
a TXT record at `_dmarc.3pandalabs.com`:

```
v=DMARC1; p=none; rua=mailto:3pandalabs@gmail.com
```

Start at `p=none` — it reports without affecting delivery. Move to
`p=quarantine` only after a couple of weeks of clean reports. Going straight to
quarantine while SPF is being changed is how legitimate mail quietly disappears.
