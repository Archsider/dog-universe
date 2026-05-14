# ADR-0007 — One way to send transactional SMS

**Status:** Accepted
**Date:** 2026-05-14
**Deciders:** solo founder

## Context

On 2026-05-14 a real client (Elisabeth) received **six** SMS in a single
minute, several hours after the events that should have triggered them:
payment confirmation, stay completed, taxi return, "Dog Universe en
route" (twice), animal on board. The admin received the **same five
events doubled** on his end.

This looked like an amateur app. The user was rightfully furious.

Forensic on the codebase revealed three independent root causes:

1. **Direct gateway calls bypass dedup.** Thirteen call sites used
   `sendSMS` / `sendAdminSMS` from `@/lib/sms` directly:
   - `api/invoices/[id]/payments/route.ts` (×2)
   - `api/admin/taxi-trips/[id]/tracking/route.ts` (×1)
   - `api/bookings/[id]/route.ts` (×1)
   - `lib/taxi-notifications.ts` (×9 — every taxi status transition)
   - …plus a handful of cron / manual paths

   None of these participated in `SmsLog` deduplication. Any retry —
   gateway-side, browser bfcache, or admin double-click — produced a
   second send because the application never recorded that the message
   had already been dispatched.

2. **TOCTOU window in the dedup itself.** `sendSmsWithRetry` did
   `isSmsDedup(read) → sendSMS → recordSmsSent(write)`. Two concurrent
   calls within ~100 ms both passed the read check and both sent.

3. **PaymentModal didn't send `Idempotency-Key`.** A double-click on
   "Enregistrer le paiement" created two `Payment` rows, fired two
   `sendAdminSMS`, and (because of (1)) sent two SMS. The server already
   honoured `Idempotency-Key` — the frontend just didn't pass one.

The "hours apart, all at once" timing pattern is partly outside our
control: the user's `sms-gate.app` SMS gateway runs on an Android phone.
When the phone is offline, the HTTP endpoint accepts and queues; when
the phone reconnects, it flushes everything. We cannot fix the
gateway's behaviour, but we can guarantee that **our application never
asks the gateway to send the same message twice**.

## Decision

**Every transactional SMS goes through `sendSmsNow` from
`@/lib/notify-now`.** No exceptions in API routes, no exceptions in
services, no exceptions in cron jobs that send to actual customers.

`sendSmsNow`:

1. Reserves `(phone, contentHash)` atomically via `tryReserveSmsSend()`
   on the `SmsLog` table. The unique index `(phone, contentHash)` is
   the lock — the loser of a race sees `P2002` and bails silently.
2. Performs up to 3 retries with backoff (0 s, 1 s, 3 s) on actual
   gateway errors. On final success, flips the row to `SENT`.
3. Returns synchronously; the send happens in the background. HTTP
   responses are never blocked by SMS gateway latency.

The dedup window is 24 h. A `PENDING` row outside the window can be
refreshed (legitimate re-send of the same content the next day); inside
the window, the second call is blocked.

### Allowed exceptions to "use sendSmsNow"

A small whitelist in `.eslintrc.json` permits direct `sendSMS` /
`sendAdminSMS` in:

- `lib/notify-now.ts` itself (the implementation)
- `lib/sms.ts` (the transport)
- `lib/queues/**` and `workers/**` (the BullMQ path for cron batches)
- `api/cron/heartbeat/route.ts` (self-monitoring alerts to SUPERADMIN,
  already dedup'd via Redis flag)
- `api/admin/clients/[id]/sms/route.ts` (manual admin send: the
  operator explicitly chose to send, dedup would surprise them)
- `api/admin/diagnostics/test-sms/route.ts` (test endpoint)

Anywhere else, `no-restricted-imports` blocks the import at lint time.

### Frontend idempotency

Forms that trigger state-changing requests with side effects (creating
a `Payment`, recording a `Booking`, etc.) MUST attach an
`Idempotency-Key` header with a fresh UUID per submit attempt. The
server stores keys for 24 h; replays return `409`.

Today: `PaymentModal` is wired. Other forms (booking creation, ...) to
follow in subsequent PRs as they're audited.

## Consequences

**Easier:**
- The same user action that fires the same SMS twice will deliver one
  SMS, end of story. The DB unique constraint is the proof.
- No more "race condition between read and write" headaches —
  INSERT-first is atomic by construction.
- `SmsLog.status = 'PENDING'` rows are now a built-in failure
  dashboard. The operator can `SELECT phone, contentHash FROM SmsLog
  WHERE status='PENDING' AND sentAt > NOW() - INTERVAL '1 hour'` to see
  what hit the gateway but failed.
- An ESLint guard prevents regressions: a new dev (or future me) can't
  re-introduce direct `sendSMS` without flipping the whitelist.

**Harder:**
- One more layer of indirection between caller and gateway. The trace
  is `route → sendSmsNow → sendSmsWithRetry → tryReserveSmsSend → DB
  unique constraint → sendSMS → gateway`. Worth it.
- `sendSmsNow` is fire-and-forget — the caller has no way to know
  whether the SMS arrived. We accept that: the operator notifies are
  visible in `SmsLog`, and customer notifications are not in the
  business-critical path (the booking exists in DB regardless of SMS).

**Trade-off accepted:** at-most-once delivery at the application layer.
The SMS gateway itself can still misbehave (sms-gate.app retries
internally when the Android device reconnects), but that's a property
of the chosen vendor, not of our code. If that becomes intolerable,
the next move is a different gateway, not more app-level logic.

## Alternatives considered

- **Idempotency-Key on every API route, server-side only.** Rejected
  as primary mechanism: it requires the frontend to opt in (which it
  may forget), and it doesn't cover server-internal call paths (auto
  geofence transition, cron jobs). Keep Idempotency-Key as a
  per-route defense in depth; the DB-level dedup is the real lock.
- **Redis SETNX flag instead of DB unique constraint.** Rejected: a
  Redis flush during a deploy would silently re-arm every dedup. The
  `SmsLog` table has 90-day retention and survives every restart.
- **Synchronous return value from sendSmsNow ("did the SMS go?").**
  Rejected: would force HTTP handlers to wait on the SMS gateway,
  whose latency we don't control. The operator can watch `SmsLog` for
  `PENDING` rows older than 1 minute to spot failures.

## Operational notes

- The `SmsLog` table comes from migration
  `prisma/migrations/20260512_sms_log/migration.sql`. **If the
  migration is not applied in production, every `tryReserveSmsSend`
  call fails open (returns `true`) and dedup is silently disabled.**
  The function logs a `warn` line when that happens. Check `/admin/health`
  invariants if duplicates resurface.
- `tryReserveSmsSend` is fail-open by design — better to deliver a
  duplicate than to silence a notification entirely if the DB is
  unreachable.
