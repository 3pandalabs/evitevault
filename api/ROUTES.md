# EviteVault API routes

`H` = requires a host access token (`Authorization: Bearer <jwt>`).
`P` = public/anonymous — the event slug and the guest invite token are the only
credentials. See `CLAUDE.md` for the rules those routes must follow.

## Auth

| | Method | Path | Notes |
|---|---|---|---|
| P | POST | `/auth/register` | 409 on an existing address, deliberately indistinguishable from other failures |
| P | POST | `/auth/login` | → `accessToken` (15m) + `refreshToken` (30d) |
| P | POST | `/auth/refresh` | Rotates: the presented token is destroyed |
| P | POST | `/auth/logout` | Always 204 |
| P | POST | `/auth/forgot-password` | Always 204 — an unknown address must be indistinguishable from a known one |
| P | POST | `/auth/reset-password` | Single-use token, 30m TTL; revokes every session on success |
| H | GET | `/auth/me` | |
| H | DELETE | `/auth/sessions` | Revokes every session for the caller |

## Events (host hub)

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events` | List with RSVP tallies joined in — one round trip for the dashboard |
| H | POST | `/events` | Cover image is set afterwards by PATCH (the key needs the event id) |
| H | GET | `/events/:eventId` | |
| H | PATCH | `/events/:eventId` | Replacing the cover deletes the old R2 object |
| H | POST | `/events/:eventId/publish` | Rejects an event with no title/date |
| H | DELETE | `/events/:eventId` | Guests, guestbook, announcements and views cascade |
| H | GET | `/events/:eventId/analytics` | RSVP tally, views, unique visitors, views-by-day, response rate |
| H | GET | `/events/:eventId/guests.csv` | Formula-injection-safe, UTF-8 BOM for Excel |

## Guests / invitations

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/guests` | `?status=` filter |
| H | POST | `/events/:eventId/guests` | Single add and bulk import (≤500); duplicate emails skipped, never overwritten |
| H | PATCH | `/events/:eventId/guests/:guestId` | Host can record an RSVP received by phone/text |
| H | DELETE | `/events/:eventId/guests/:guestId` | |
| H | POST | `/events/:eventId/guests/:guestId/rotate-token` | For a personal link that leaked to a group chat |
| H | GET | `/events/:eventId/rsvp-log` | Append-only history of status changes |

## Guestbook moderation

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/guestbook` | Includes hidden posts |
| H | PATCH | `/events/:eventId/guestbook/:postId` | `{ status: visible \| hidden }` |
| H | DELETE | `/events/:eventId/guestbook/:postId` | Also deletes the R2 object |

## Announcements

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/events/:eventId/announcements` | |
| H | POST | `/events/:eventId/announcements` | Audience: all/attending/pending/maybe/declined. Row is written before the send so a partial delivery is still visible |

## Templates

| | Method | Path | Notes |
|---|---|---|---|
| H | GET | `/templates` | System templates + the caller's own |
| H | POST | `/templates` | Saved as a host template; key is namespaced by user id |
| H | DELETE | `/templates/:templateId` | System templates can't be deleted (predicate requires `created_by = caller`) |

## Storage (R2 presigned URLs)

| | Method | Path | Notes |
|---|---|---|---|
| H | POST | `/events/:eventId/cover/presign-upload` | Key generated server-side; image content types only, pinned into the signature |
| H | POST | `/storage/presign-download` | Authorized by the key's `events/<id>/` prefix |
| P | POST | `/public/events/:slug/guestbook/presign-upload` | Only when the event allows guest photos |

## Public invitation

| | Method | Path | Notes |
|---|---|---|---|
| P | GET | `/public/events/:slug` | `?t=<inviteToken>` personalises. Published events only; records a view (deduped hourly) |
| P | POST | `/public/events/:slug/rsvp` | Token → updates that guest. No token → creates one, but only if the event allows public RSVP, and never over an existing invitee's email |
| P | GET | `/public/events/:slug/calendar.ics` | RFC 5545, CRLF + folded (Outlook rejects LF) |
| P | GET | `/public/events/:slug/guestbook` | Visible posts only, with presigned photo URLs |
| P | POST | `/public/events/:slug/guestbook` | Image key must be under this event's guestbook prefix |

## Ops

| | Method | Path | Notes |
|---|---|---|---|
| P | GET | `/health` | |
| — | GET | `/metrics` | Bearer `METRICS_TOKEN`; 503 when unconfigured so a missing ops secret can't fail a deploy |
