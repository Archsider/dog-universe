# Secret Rotation Playbook

Tier 2 hardening (2026-05-09).

Trimestrial cadence by default; immediate rotation on any suspected compromise (laptop loss, repo leak, contractor offboarding, suspicious Vercel audit log).

All secrets live in **Vercel Environment Variables** (`Production` + `Preview` scopes). Local `.env.local` is gitignored and per-developer.

---

## TOTP_ENCRYPTION_KEY

**Purpose:** AES-256-GCM key for at-rest encryption of `User.totpSecret`. Required in production (boot-check fails fast if missing or not 64 hex chars).

**Format:** `openssl rand -hex 32` → 64-char hex string (32 bytes).

**Cadence:** trimestrial OR on any suspected compromise of Vercel env vars.

**WARNING:** rotating this key invalidates every existing TOTP secret. ADMIN/SUPERADMIN users with TOTP enabled will be locked out at next signin (the validate route returns `TOTP_INVALID` because decrypt fails).

**Procedure (cutover with re-enrollment):**

1. Generate the new key: `openssl rand -hex 32`.
2. Communicate a maintenance window to all ADMIN/SUPERADMIN.
3. Pre-deploy migration: write a one-shot script `scripts/rotate-totp.ts` that, given `OLD_KEY` and `NEW_KEY`:
   - Reads each `User` with `totpEnabled = true`.
   - Decrypts `totpSecret` with `OLD_KEY`.
   - Re-encrypts with `NEW_KEY`.
   - Writes back in a single transaction.
4. Run the script with both env vars set, verify log lines for each user.
5. Update Vercel env: replace `TOTP_ENCRYPTION_KEY` with the new value.
6. Redeploy. Smoke-test: SUPERADMIN signs in with their existing authenticator code → expect success.
7. Delete the old key from any local/CI secret store.

**Procedure (hard cutover, accepts re-enrollment):**

1. Generate new key, update Vercel env, redeploy.
2. Send each ADMIN/SUPERADMIN a notification: "TOTP reset required. Visit /admin/profile to re-enroll."
3. Server-side: run a one-time SQL to clear the now-undecryptable secrets so the UI offers fresh enrollment:
   ```sql
   UPDATE "User"
      SET "totpSecret" = NULL,
          "totpEnabled" = false
    WHERE "totpEnabled" = true;
   ```
4. Each user re-enrolls normally.

**Smoke test:** SUPERADMIN signin → TOTP prompt → valid code → session granted.

---

## NEXTAUTH_SECRET

**Purpose:** signs JWT session cookies (NextAuth).

**Format:** `openssl rand -base64 48`.

**Cadence:** trimestrial OR on suspected leak.

**Effect of rotation:** every active session is invalidated (signature no longer verifies). Users see a sudden signout.

**Procedure:**

1. Generate a new value.
2. Update Vercel env (Production + Preview).
3. Redeploy.
4. Inform users that they will be signed out once.

**Dual-key support:** NextAuth v5 accepts a `secret` array — first entry is used for signing, all entries are tried for verification. If we want a zero-downtime rotation:

```ts
// auth.ts
secret: [process.env.NEXTAUTH_SECRET_NEW, process.env.NEXTAUTH_SECRET].filter(Boolean),
```

Roll for ~24 h with both keys, then drop the old one. We have NOT wired this today — current rotations are accept-the-signout cutover.

**Smoke test:** signin → land on dashboard → refresh → still signed in.

---

## CRON_SECRET

**Purpose:** authenticates Vercel cron POSTs to `/api/cron/*` and `/api/workers/process` via header `x-cron-secret`. Vercel injects it automatically as `Authorization: Bearer`.

**Format:** `openssl rand -hex 32`.

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. Generate the new value.
2. Update Vercel env.
3. Redeploy. Vercel uses the new value on the next cron tick.

**Dual-key support:** not implemented — value is checked with `timingSafeEqual` against a single env. Cron jobs are idempotent so a missed tick during cutover is acceptable.

**Smoke test:** wait for next cron run, check Vercel logs for HTTP 200 (not 401).

---

## DATABASE_URL (password)

**Purpose:** Postgres connection string. The password is the rotatable component.

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. In Supabase dashboard → Database → connection settings, rotate the password.
2. Update `DATABASE_URL` in Vercel env (and `DIRECT_URL` if used).
3. Redeploy.
4. Verify `/api/health` returns 200 and recent queries succeed.

**Dual-key support:** not applicable — Postgres has one password per role. To minimize downtime, do steps 1+2 within the same minute.

**Smoke test:** GET `/api/health` → 200 within 30 s of redeploy. Run `SELECT now()` via Studio.

---

## ANTHROPIC_API_KEY

**Purpose:** authenticates calls to Claude API for vaccination document extraction.

**Format:** `sk-ant-...` issued by Anthropic console.

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. Create a new key in Anthropic console (don't revoke the old one yet).
2. Update Vercel env, redeploy.
3. Wait until you observe a successful extraction with the new key (Vercel logs).
4. Revoke the old key in Anthropic console.

**Dual-key support:** native — both keys are valid until you revoke the old one.

**Smoke test:** upload a vaccination document via `/admin/animals/{id}` → check that a `Vaccination` row in `DRAFT` status is created with non-empty fields.

---

## SUPABASE_SERVICE_ROLE_KEY

**Purpose:** server-side full-access key for Supabase Storage and RPC.

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. Supabase dashboard → Settings → API → reset the service-role key.
2. Update Vercel env immediately (the old one stops working at reset).
3. Redeploy.

**Dual-key support:** not native; cutover. Document a maintenance window if rotating during business hours.

**Smoke test:** upload a pet photo via `/client/pets/new` → succeeds. Sign a contract → resulting PDF accessible via signed URL.

---

## UPSTASH_REDIS_REST_TOKEN

**Purpose:** REST token used by `@upstash/redis` for cron-lock, idempotency, cache, rate-limit.

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. In Upstash console → database → `Reset Token`.
2. Update Vercel env.
3. Redeploy.

**Dual-key support:** Upstash supports primary + read-only tokens. For zero-downtime rotation, generate a second token, update env, redeploy, then delete the old one.

**Smoke test:** signin → middleware rate-limit hits succeed. Cron tick logs confirm `acquireCronLock` returns true / false (not throw).

---

## UPSTASH_REDIS_PASSWORD

**Purpose:** TCP password for IORedis used by BullMQ (queues + workers).

**Cadence:** trimestrial OR on suspected leak.

**Procedure:**

1. In Upstash console → database → `Reset Password` (TCP).
2. Update Vercel env (`UPSTASH_REDIS_PASSWORD`, ensure `UPSTASH_REDIS_HOST`/`PORT` are still correct).
3. Redeploy.
4. Wait for `/api/workers/process` to next-tick: queue stats in `/admin/queues` should populate without errors.

**Dual-key support:** not native; cutover. Workers being ephemeral (one Lambda invocation per minute) means downtime is at most ~60 s.

**Smoke test:** create a booking → confirm email is delivered (queue → worker → SMTP).

---

## General checklist for every rotation

- [ ] New value generated with documented entropy command (no shortcuts).
- [ ] Vercel env updated in `Production` AND `Preview`.
- [ ] Old value retained in a 1Password / vault entry tagged `rotated YYYY-MM-DD` for 30 days, then purged.
- [ ] Smoke test passed on production within 1 h of cutover.
- [ ] `docs/AUDIT_LOG.md` not required for rotations (no DB write), but post a short summary in the team channel.
- [ ] If the rotation was triggered by a suspected compromise, escalate per incident playbook (not in scope here).
