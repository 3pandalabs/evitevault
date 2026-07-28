# Postgres — `evitevault` database on the shared instance

**Status: DONE (2026-07-27).** Recorded here so it can be reproduced on a fresh
box, not because it needs running again.

There is one Postgres instance on `nrighar-coolify-fsn` shared by every app
(`3pandalabs-postgres`), with a database and an owning role per app. RsvpVault
adds:

| Database | Owning role |
|---|---|
| `evitevault` | `evitevault_app` |

alongside the existing `nrighar`/`nrighar_app`, `receiptcash`/`receiptcash_app`
and `temporal`/`temporal_app`.

## Finding the container

Coolify container names are opaque random ids, so `--filter name=` matches
nothing useful. As of 2026-07-27 the shared instance is
`fj1trumhdfozqharrsx1frm9` — but **there are two `postgres:17-alpine`
containers on this box** and the other one (`vv554ns7tyw9c2jffb84669t`) holds
only the template databases. Confirm before touching anything:

```bash
docker ps --format '{{.Names}}\t{{.Image}}'
docker exec -i <name> psql -U postgres -tAc 'select datname from pg_database order by 1'
# the right one lists nrighar, receiptcash, temporal, evitevault
```

## What was run

```sql
-- as postgres, on the shared instance
CREATE ROLE evitevault_app LOGIN PASSWORD '<generated>';
CREATE DATABASE evitevault OWNER evitevault_app;

-- then connected to the evitevault database:
ALTER SCHEMA public OWNER TO evitevault_app;
GRANT ALL ON SCHEMA public TO evitevault_app;
```

Verified with:

```bash
docker run --rm --network coolify -e PGPASSWORD='<pw>' postgres:17-alpine \
  psql -h fj1trumhdfozqharrsx1frm9 -U evitevault_app -d evitevault \
  -tAc "select current_user, current_database(), has_schema_privilege('public','CREATE')"
# → evitevault_app|evitevault|t
```

The `ALTER SCHEMA public OWNER` is the important line. On PG15+ the public
schema is owned by `pg_database_owner` and `CREATE` is revoked from `PUBLIC`;
making the app role the explicit owner is what stops the class of failure that
took RentVault's API down on 2026-07-25, where objects created by a superuser
run were owned by `postgres` and the runtime role got `42501 permission denied`
against its own schema.

## Connection string

```
postgres://evitevault_app:<password>@fj1trumhdfozqharrsx1frm9:5432/evitevault
```

**The hostname is the container name, and it changes on every redeploy of the
Postgres resource** — the same trap as `TEMPORAL_ADDRESS` on RentVault. If
`evitevault-api` suddenly can't reach the database after unrelated Coolify work,
re-check the container name before debugging anything else.

## Rules for this database

- **Do not set `MIGRATION_DATABASE_URL`.** `evitevault_app` owns everything and
  runs its own DDL. Migrating as `postgres` creates objects the runtime role
  cannot read.
- Migrations apply automatically at container start (`api/Dockerfile` CMD) and
  must stay idempotent.
- Seeding templates is separate and manual: `node dist/db/seed.js` inside the
  container. It is safe to re-run (upsert on the template `key`).

## Backups

Configure in Coolify: Postgres resource → Backups → Add Scheduled Backup,
targeting the `evitevault-backups` R2 bucket via the S3 Storage registered in
Coolify's global Storages section. Register the S3 Storage first — the Backups
tab only offers already-validated storages, and shows "No validated S3 Storages
found" otherwise. Take one manual "Backup now" and confirm the object lands in
the bucket before trusting the schedule.
