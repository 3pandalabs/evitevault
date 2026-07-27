# Cloudflare R2 setup

Two buckets, both private. Nothing is ever served from a public bucket URL —
every read and write goes through a presigned URL minted by `evitevault-api`.

| Bucket | Holds | Status |
|---|---|---|
| `evitevault-media` | Event cover images and guest-uploaded guestbook photos | **Created 2026-07-27** |
| `evitevault-backups` | Coolify's Postgres backup target | **Created 2026-07-27** |

Created with:

```bash
npx wrangler r2 bucket create evitevault-media
npx wrangler r2 bucket create evitevault-backups
```

Kept separate for the same reason as RentVault's pair: a bucket-level access
mistake on user uploads shouldn't also expose database dumps. Don't collapse
them into one bucket with prefixes.

Account ID: `f688cc57abfb9e1ef72a57f4841e0e73`
Endpoint: `https://f688cc57abfb9e1ef72a57f4841e0e73.r2.cloudflarestorage.com`

## API token — MANUAL STEP

R2 S3 credentials cannot be created with `wrangler`; they need the dashboard.

**Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token**

- Permissions: **Object Read & Write**
- Bucket scope: **restrict to `evitevault-media` and `evitevault-backups`** —
  not "all buckets", which would hand this app's credentials access to
  RentVault's and ReceiptCash's user documents.
- TTL: no expiry (service credential). Note the creation date in
  `tech-stack.md` so it can be rotated later.

This yields an **Access Key ID** and a **Secret Access Key** (shown once).

## Resulting env

```
R2_ACCOUNT_ID=f688cc57abfb9e1ef72a57f4841e0e73
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=evitevault-media
R2_ENDPOINT=https://f688cc57abfb9e1ef72a57f4841e0e73.r2.cloudflarestorage.com
```

The same key pair goes into both `evitevault-api`'s Coolify environment and
Coolify's S3 Storage entry for backups — only the bucket name differs.

## Key layout

Defined in `api/src/plugins/r2.ts`; authorization is a prefix check, never a
bucket listing.

```
events/<eventId>/cover/<uuid>.<ext>       host-uploaded cover art
events/<eventId>/guestbook/<uuid>.<ext>   guest-uploaded wall photos
```

Two properties worth preserving if this ever changes:

- **Keys are always generated server-side**, never accepted from a client. A
  client-supplied key is a write primitive over the whole bucket regardless of
  how carefully it is validated afterwards.
- **The content type is pinned into the presigned PUT signature** and limited
  to `image/{jpeg,png,webp,avif}`, so a caller who asks to upload a PNG cannot
  then PUT an HTML file to that key.
