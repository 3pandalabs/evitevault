# Email sending

RsvpVault does not talk to an email provider directly. It posts finished
messages to the shared org gateway, **[3pandalabs/mailer](https://github.com/3pandalabs/mailer)**
— one Cloudflare Worker at `mailer.3pandalabs.com` that every app in the org
sends through.

**Status: live and delivering** (confirmed 2026-07-28 — invitation, RSVP
confirmation, announcement and password-reset mail all arriving at an external
address). `evitevault.3pandalabs.com` is onboarded as the sending domain and
`MAILER_URL`/`MAILER_TOKEN` are set on `evitevault-api` in Coolify, so
"Remaining setup" below is history, not a to-do.

Email is still an addition rather than a dependency: if the gateway is ever
unreachable the app counts the sends as skipped and says so, instead of
implying mail went out, and hosts can always share the link or QR code.

**The sender address is `invitations@rsvpvault.3pandalabs.com`** (switched
2026-07-28, 3pandalabs/mailer#1) — the one exception to the copy-only rename,
because guests read the from-line. Everything else keeps its `evitevault`
identifier per the naming rule in `CLAUDE.md`.

**`evitevault.3pandalabs.com` no longer exists in Resend — it was deleted
during the switchover, so there is no falling back to it.** Its DNS records are
still in Cloudflare but mean nothing without the Resend domain; sending from
that address now returns `403 domain is not verified`. `APP_SENDERS` therefore
lists only the rsvpvault address. Do not "restore" the old one as a safety net
without re-adding and re-verifying the domain first — a dead address in that
list looks like a fallback and is not one.

Sender reputation restarted from zero on the new subdomain, so expect a rougher
first week for inbox placement than the old domain had earned.

### If mail stops: read the API log, not the dashboard

Every failed send is logged by `evitevault-api` with Resend's own message,
which names the exact domain and reason:

```bash
ssh root@167.233.223.241 \
  "docker logs --tail 40 \$(docker ps -qf name=wa8y19d56nb14wy36m5holre)"
```

This is the fastest diagnosis by a wide margin. During the 2026-07-28
switchover the symptom was "no email arrives", and the log said plainly which
domain was unverified — while the Resend dashboard's per-record green ticks
were being mistaken for domain-level verification. The domain status chip sits
next to the domain name, not in the DNS records table.

## Why there is no provider credential here

**The gateway sends through Resend** — it POSTs to `api.resend.com` with a
`RESEND_API_KEY` held as a Worker secret, using a sending-only restricted key
that cannot list domains or manage the account. Sending domains are therefore
verified **in the Resend dashboard**, not in Cloudflare Email Sending. (An
earlier version of this document described a Workers `send_email` binding;
that was never how the gateway shipped. Corrected 2026-07-28 — it would send
you to the wrong dashboard.)

DNS records for a sending domain do live in Cloudflare, because that is where
`3pandalabs.com` is hosted, but they are ordinary TXT/MX records added by hand.

Either way the point stands: **no provider credential exists in this app** —
not in its environment, not in Coolify, not in a `.env`. This app holds only
`MAILER_TOKEN`, which grants exactly one capability: send as RsvpVault's own
configured sender address.

That is also why the gateway is a Worker rather than a shared npm package. A
package running inside each app would have reintroduced one provider token per
app, stored in each app's environment.

## What lives where

| Concern | Where |
|---|---|
| Templates (invitation HTML/text, inline QR) | **here** — `api/src/lib/emails/`, `api/src/lib/qr.ts` |
| Deciding who to send to, and when | **here** — `api/src/routes/guests.ts`, `announcements.ts` |
| Transport, provider credentials, sender authorisation, batching | **gateway** |

The gateway is a dumb transport and must stay one. If it ever needs to know
what an "event" is, something has been put in the wrong place.

## Remaining setup

### 1. Verify the sending domain — dashboard, one time

**Resend → Domains → Add Domain** → the subdomain
(`evitevault.3pandalabs.com` originally; `rsvpvault.3pandalabs.com` for the
rename). Resend then lists DKIM/SPF TXT records and a bounce-handling MX
record — add each in **Cloudflare DNS for `3pandalabs.com`**. TXT and MX are
never proxied, so there is no orange-cloud decision. Propagation is minutes.

Prefer the subdomain over the apex. RsvpVault mails guests who never signed up
with the org — the one sender most likely to collect spam complaints. Reputation
is per-domain, so isolating it keeps that away from the domain the company's
real mail flows through. (The Cloudflare *account* reputation is shared
regardless; the subdomain limits the blast radius, it doesn't remove it.)

### 2. Set two env vars on `evitevault-api` in Coolify, then redeploy

```
MAILER_URL=https://mailer.3pandalabs.com
MAILER_TOKEN=<evitevault's token from the gateway's APP_TOKENS secret>
```

`EMAIL_FROM_NAME` is optional and defaults to `RsvpVault`. There is deliberately
no `EMAIL_FROM` here — the sender **address** lives in the gateway's
`APP_SENDERS` so it can't drift between the two repos.

### 3. Verify

```bash
curl -s https://mailer.3pandalabs.com/health          # {"ok":true}
```

Then add a guest with your own address to a published event. Expect the
invitation with the QR inline, and the dashboard to report "Added 1. Emailed 1."
rather than the "email isn't set up" message.

## Also worth doing

`3pandalabs.com` has **no DMARC record**. Without one, receivers have no
instruction for mail that fails authentication, which hurts inbox placement. Add
a TXT record at `_dmarc.3pandalabs.com`:

```
v=DMARC1; p=none; rua=mailto:3pandalabs@gmail.com
```

Start at `p=none` — it reports without affecting delivery. Move to
`p=quarantine` only after a couple of weeks of clean reports. Going straight
there while SPF is being changed is how legitimate mail quietly disappears.
