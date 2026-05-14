# ADR-0004 — Three Supabase Storage buckets, not one

**Status:** Accepted
**Date:** 2026-05-13
**Deciders:** solo founder, Claude (refactor session)

## Context

Originally Dog Universe used two Supabase Storage buckets:

- `uploads` — public, photos (`pets/`, `stays/`)
- `uploads-private` — private, signed URLs (contracts, documents)

Then we added a daily DB backup feature that uploads `.json.gz` dumps.
We initially put backups in `uploads-private/backups/` to avoid creating
a third bucket.

This failed in production (PR #54 → #56). The `uploads-private` bucket
had an MIME whitelist (PDF + images only — locked down because contracts
contain signature data) and rejected every `.gz` upload with `mime type
application/gzip is not supported`.

We had two paths:

1. Loosen the `uploads-private` whitelist to also accept gzip
2. Move backups to a dedicated bucket

## Decision

**We will use THREE buckets:**

- `uploads` (public) — photos, no MIME restriction (anyone can post)
- `uploads-private` (private, MIME-whitelisted to PDF + images) —
  contracts, documents
- `db-backups` (private, no MIME restriction) — DB dumps

`SUPABASE_BACKUPS_BUCKET` env var (default `db-backups`) controls the
backup destination. The bucket name is centralised in
`getBackupBucket()` (`src/lib/db-backup.ts`); every backup-related route
imports from there.

## Consequences

**Easier:**
- The contracts bucket keeps its strict MIME whitelist (security
  defense — an attacker can't upload an HTML payload disguised as a PDF)
- Backups don't pollute the contracts ACL/audit
- Storage monitoring is per-domain (we can alert on `db-backups`
  growing >X GB without false positives from contracts)
- Single source of truth: `getBackupBucket()` — change the bucket in ONE
  place

**Harder:**
- Three buckets to provision in a fresh Supabase project (documented in
  `docs/PGBOUNCER.md` + `docs/BACKUP_RESTORE.md`)
- One more env var to set on Vercel

**Trade-off accepted:** the operational overhead (one extra bucket +
one env var) is trivial vs. the security cost of loosening the
contracts MIME policy.

## Alternatives considered

- **One bucket, no MIME restriction** — rejected. Removes a real
  security guard for contracts.
- **One bucket, allow `application/octet-stream`** — what we tried in
  PR #55. Worked but conflated three different access patterns in one
  bucket.
- **External backup service (S3 / Backblaze)** — rejected for now. Adds
  a 4th vendor + AWS IAM complexity. Reconsider when storage > 10 GB or
  when we want cross-region.
