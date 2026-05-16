# AI Guardian — Sentry → Claude → GitHub triage

Auto-triage pipeline for Sentry errors. When Sentry posts a webhook, Claude
Haiku classifies the event and the system either opens (or comments on) a
GitHub issue, notifies a SUPERADMIN in-app, or silences the noise.

## Architecture

```
Sentry  ── HMAC POST ──>  /api/webhooks/sentry
                                │
                                ├─ verify Sentry-Hook-Signature (SENTRY_WEBHOOK_SECRET)
                                ├─ idempotency  (Redis SET NX EX 24h on sentry:event:{id})
                                ├─ sanitize     (strip PII: emails / phones / IDs / JWTs)
                                ├─ classify     (Claude Haiku 4.5 — JSON envelope)
                                ├─ act          (open GH issue / notify admin / silence)
                                └─ persist      (GuardianEvent row)
```

Files:

- `src/app/api/webhooks/sentry/route.ts` — HTTP endpoint
- `src/lib/guardian/classifier.ts` — Anthropic SDK call + JSON validation
- `src/lib/guardian/sanitize.ts` — PII stripper (email, phone, IPv4/v6, JWT, cuid, uuid)
- `src/lib/guardian/github.ts` — issue create / dedupe via labels
- `src/app/[locale]/admin/guardian/{page,GuardianClient}.tsx` — SUPERADMIN UI
- `prisma/migrations/20260513_guardian_events/migration.sql` — schema migration

## Required environment variables

The Guardian uses a **feature toggle** to gate its env requirements at boot.

| Var | Required when | Purpose |
| --- | --- | --- |
| `AI_GUARDIAN_ENABLED` | always (defaults to off) | Master switch. Set to `1` or `true` to enable. When **on**, the 4 vars below become hard requirements at boot. When **off**, they're warnings only. |
| `SENTRY_WEBHOOK_SECRET` | Guardian ON, prod | HMAC-SHA256 secret matching the Sentry integration |
| `ANTHROPIC_API_KEY` | Guardian ON, prod | If absent → all events stored as `unclassified` and admin is notified |
| `GITHUB_TOKEN` | Guardian ON, prod | PAT with `repo` (or `public_repo`) scope |
| `GUARDIAN_GITHUB_REPO` | Guardian ON, prod | Format: `owner/name` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | always (other features need them) | Idempotency flag for Guardian (fail-open if missing) |

### Boot-check behaviour (since 2026-05-17, WIN 5)

`src/lib/boot-checks.ts` enforces the toggle :

- **`AI_GUARDIAN_ENABLED=true` in prod + missing any of the 4 vars** →
  `BOOT_CHECK_FAILED` thrown at `register()`, deploy fails. Defeats the
  "feature on but silent" failure mode the audit Reilly M1 flagged.
- **`AI_GUARDIAN_ENABLED=true` in dev + missing vars** → warning only
  (non-blocking, dev experience preserved).
- **`AI_GUARDIAN_ENABLED` unset / off** → all Guardian vars stay
  optional. Operator sees a warning per missing var ("set
  `AI_GUARDIAN_ENABLED=true` to enable") so they know what to set if
  they want to flip the feature on later.

Accepted truthy values for `AI_GUARDIAN_ENABLED` : `1`, `true`, `TRUE`,
`True` (case-insensitive). Anything else = disabled.

## Sentry setup

1. In your Sentry org → **Settings → Custom Integrations → Create New
   Integration**.
2. Set the **Webhook URL** to `https://<your-domain>/api/webhooks/sentry`.
3. Set a strong **Signing Secret** (≥32 chars). Save it as
   `SENTRY_WEBHOOK_SECRET` in Vercel project env (Production + Preview).
4. Subscribe to **issue** and **error** events.
5. Install the integration on your project.

Sentry will sign each request with `Sentry-Hook-Signature: <hex-hmac>`. The
endpoint verifies that header in constant time before doing any work.

## GitHub PAT setup

1. Create a fine-grained PAT scoped to your repo with **Issues: Read & Write**.
2. Save as `GITHUB_TOKEN` in Vercel env.
3. Set `GUARDIAN_GITHUB_REPO=<owner>/<repo>` (e.g. `Archsider/dog-universe`).
4. (Optional) pre-create a label called `guardian` with a recognisable colour.
   The endpoint will fall back to creating issues with only the `guardian`
   label if labels do not exist.

## Triage rules

The classifier is biased toward conservative actions:

| Classification     | Default action      | Notes |
| ------------------ | ------------------- | ----- |
| `transient`        | `silence`           | Network blips, timeouts, upstream 502 |
| `bug_code`         | `github_issue`      | Only when `occurrencesLast24h ≥ 3` (else silenced) |
| `data_corruption`  | `notify_admin`      | Always pings SUPERADMIN |
| `infra`            | `notify_admin`      | DB / Redis / Supabase down |
| `spam`             | `silence`           | Bot scans, already-resolved noise |
| `unclassified`     | `notify_admin`      | Used when Claude is unavailable or returns garbage |

Severity is a 1..5 integer surfaced as a coloured badge in `/admin/guardian`.

## PII / RGPD

The sanitizer (`src/lib/guardian/sanitize.ts`) is applied **before** the
event reaches Claude:

- Emails, phones, IPv4 / IPv6, JWTs, Bearer tokens, cuids, UUIDs and
  long digit runs are replaced with `[REDACTED_*]` markers.
- Object keys in `{email, phone, password, token, authorization, cookie,
  apikey, secret, address, firstName, lastName, name, …}` are dropped
  to `[REDACTED]`.
- Arrays > 50 entries are truncated; recursion depth is capped at 6.

The full Sentry payload is never persisted — only the sanitized title,
culprit, level and a 5-frame stack preview land in `GuardianEvent`.

## Operating the dashboard

`/admin/guardian` (SUPERADMIN only) shows the last 30 events. Each row has:

- timestamp + sanitized title + culprit
- classification badge + severity badge (1..5)
- action taken (GitHub issue / Admin notified / Silenced)
- 24h occurrence counter
- direct link to the GitHub issue (if any)

A category filter at the top narrows the list to a single classification
(useful when an `infra` event storms in and you want to focus on it).

## Failure modes (all fail-open)

- **No Anthropic key** → event stored as `unclassified`, admin notified.
- **Anthropic timeout / 5xx** → same as above, with the SDK error in `reason`.
- **Redis unreachable** → idempotency flag is treated as fresh; possible
  duplicate processing, harmless because `sentryEventId` has a unique
  index in DB.
- **GitHub API failure** → issue creation falls through to admin
  notification so the signal is never lost.
- **Webhook signature missing or wrong** → 401 returned to Sentry.

## Local testing

```bash
# Generate a signature manually for a fixture payload
node -e '
  const c = require("crypto");
  const secret = "dev-secret";
  const body = JSON.stringify({ data: { event: { event_id: "abc123", title: "TypeError: x is undefined" } } });
  console.log("Signature:", c.createHmac("sha256", secret).update(body).digest("hex"));
  console.log("Body:", body);
'

curl -X POST http://localhost:3000/api/webhooks/sentry \
  -H "Content-Type: application/json" \
  -H "Sentry-Hook-Signature: <signature>" \
  -d '<body>'
```
