# ADR-0008 — Respectful SMS policy (quiet hours + walk-in suppression)

**Status:** Accepted
**Date:** 2026-05-14
**Deciders:** solo founder

## Context

The solo founder does accounting catch-up at night. Each `prisma.payment.create`
fires a "Votre paiement a bien été reçu" SMS to the client. A 23h batch of
catch-up payments meant real clients waking up to a flurry of texts from
"Dog Universe" hours after they had already left the kennel — the
amateur-app look we're explicitly trying to leave behind.

Two distinct problems sit underneath:

1. **Quiet hours.** Operations SMS (taxi en route, animal arrived) are
   real-time by nature — the client is actively waiting on the event.
   Accounting SMS (payment confirmation, stay completed) are
   asynchronous to the client: nothing changes for them if the SMS
   arrives at 9h instead of 23h, except their willingness to keep
   receiving SMS from us.

2. **Walk-in customers.** A walk-in paid cash, the transaction is
   closed, they don't have an account, and they came for a one-off
   service. Sending them a "your payment has been received" SMS the
   following morning looks like a marketing nag from a vendor they
   visited once. The information serves zero customer purpose.

The previous behaviour was "send everything, immediately, to everyone"
— easy to reason about, hostile in practice.

## Decision

Introduce a **respectful SMS policy** layered on top of the existing
`sendSmsNow` pipeline. Three rules, evaluated in order, embodied in
the pure function `decideSmsPolicy({ category, recipient, now })`:

### Rule 1 — ADMIN recipient OR OPS category = SEND NOW

The operator (`to: 'ADMIN'`) always gets real-time notification of
events on their books. Asking them to wait until 9h for "a payment
was just recorded" defeats the point of having operator alerts.

OPS category covers user-driven, time-sensitive events: taxi tracking
transitions, booking confirmations triggered by the client's own
submission, urgent admin alerts. The user is waiting on the SMS by
definition.

### Rule 2 — Walk-in + COMPTA = SKIP

Walk-ins paid cash on the spot. They have no client account, no
relationship to maintain, no follow-up to anticipate. A "payment
received" SMS the next morning is noise. **Drop it entirely**, no
queue, no defer, no retry.

If the operator wants to override this in a specific case (a known
walk-in they want to acknowledge), the PaymentModal toggle on the UI
lets them tick the "Send confirmation SMS" checkbox manually; the
checkbox simply skips this rule for that one send.

### Rule 3 — Standard + COMPTA + quiet hours = DEFER

Quiet hours are **21:00–09:00 Casablanca**. Inside that window, a
COMPTA SMS to a standard client is queued via BullMQ with a `delay`
that lands the job at 09:00 Casablanca local. The worker cron picks
it up at the next 5-min tick after 09:00 and dispatches.

The SmsLog atomic reservation (ADR-0007) still applies at delivery
time, so a series of catch-up payments queued during one night
collapses to at most one SMS per `(phone, content)` pair.

If currently in business hours, the SMS goes out immediately.

## Implementation

Three new exports (and one wrapper) in `src/lib/sms-policy.ts`:

```ts
type SmsCategory = 'OPS' | 'COMPTA';
type SmsRecipientType = 'standard' | 'walkin' | 'admin';
type SmsPolicyDecision =
  | { kind: 'send-now' }
  | { kind: 'defer'; delayMs: number; reason: 'quiet_hours' }
  | { kind: 'skip'; reason: 'walkin_compta' };

function decideSmsPolicy(input): SmsPolicyDecision;
function isQuietHoursCasablanca(now): boolean;
function delayUntilBusinessHoursMs(now): number;
function classifyRecipient(client): SmsRecipientType;
```

Pure functions, no side effects, fully unit-tested (41 cases covering
the decision matrix + boundary hours).

The wrapper `sendSmsRespectful(data, { category, recipient? })` in
`src/lib/notify-now.ts` translates a decision into the actual action:

- `send-now` → `sendSmsNow(data)` (existing direct path)
- `defer` → `enqueueSms(data, undefined, { delay })` (BullMQ delayed
  job; the worker cron processes it after the delay elapses)
- `skip` → structured info log, no SMS

`enqueueSms` accepts a new optional `delay` parameter (milliseconds);
when `> 0` it's forwarded to BullMQ's `JobsOptions.delay`. BullMQ
treats the job as invisible until the delay has elapsed.

### Casablanca timezone

Morocco abolished DST in 2018 and pinned the clock to permanent
**UTC+01:00**. The policy module uses that fixed offset directly,
avoiding the cost (and bug risk) of an IANA library lookup. The
**one** place to change if Morocco ever revisits is the
`CASA_OFFSET_MINUTES` constant.

### UI surface

`PaymentModal` (the most frequent call site for COMPTA SMS to clients)
now exposes a checkbox:

```
☑ Envoyer SMS de confirmation au client
  ⓘ Heures calmes — SMS reporté à 9h demain     (quiet hours warning)
  ⓘ Walk-in — SMS non recommandé                (walk-in hint)
```

Defaults:
- Standard client → checked
- Walk-in → unchecked

The operator can override either way. The label text updates
dynamically based on the current Casablanca hour and the client's
walk-in flag; both pieces of info are passed as props from the
server-rendered page.

If unchecked, the request body carries `sendClientSms: false` and the
payment route skips the client SMS altogether (the admin SMS still
goes out — the operator wants their own ledger notification).

If checked, the request body carries `sendClientSms: true` (the
default) and the server still applies `decideSmsPolicy` to translate
that into actual behaviour (might still defer or skip).

## Consequences

**Easier:**

- Night-time accounting doesn't disturb clients. The "I'm doing
  compta at midnight" use case stops being an excuse to inconvenience
  the customer.
- Walk-ins never get an unsolicited follow-up SMS. Better brand
  perception for one-off interactions.
- The SmsLog dedup window already protected against duplicates inside
  24h — now combined with the defer queue, the worst case is
  "client receives ONE SMS at 9h" instead of "client receives several
  SMS at 23h".
- The UI checkbox surfaces the policy decision directly: the operator
  always knows what's about to happen. No "wait, did that SMS go?".

**Harder:**

- A small layer of indirection between `sendSmsNow` and the actual
  gateway. The path is now `route → sendSmsRespectful → decision →
  (sendSmsNow | enqueueSms.delay | log)`. Worth it for the policy
  visibility.
- The delivery time of a COMPTA SMS can be up to ~12h after the
  trigger (worst case: trigger at 21:01 Casa → delivery at 09:00
  next day). This is acceptable because the SMS information is not
  time-sensitive by definition (that's why we classified it COMPTA).
- One more concept (`category`) the operator and future devs have to
  internalise. The lint surface around `sendSmsNow` vs
  `sendSmsRespectful` is documented in CLAUDE.md and inline JSDoc.

**Trade-off accepted:** COMPTA SMS may arrive up to ~12h after the
admin action. We pay this latency in exchange for never disturbing a
client during their sleep — the brand cost of "amateur app" is far
larger than the operational cost of "12h SMS delay for non-urgent
notifications".

## Alternatives considered

- **Just suppress all SMS to walk-ins, no quiet hours.** Rejected:
  the night-spam complaint applied to standard clients too, not just
  walk-ins.
- **Quiet hours but no walk-in skip.** Rejected: walk-ins still get
  morning SMS for a transaction they consider closed; we want to drop
  these entirely, not just defer them.
- **Per-call-site decision in each route.** Rejected: the policy is
  identical across COMPTA flows and a future bug would creep into one
  call site only. Centralisation in `sms-policy.ts` makes the
  invariant testable in one place.
- **Use cron `enqueueSms` instead of `sendSmsRespectful` for
  everything in quiet hours.** Rejected: ops SMS (taxi en route)
  need to go out immediately regardless of the hour. The
  category-aware decision is the right granularity.
- **Use an IANA-aware library (`date-fns-tz`, Luxon) for Casablanca
  time.** Rejected: Morocco's permanent +01:00 offset means a single
  integer constant is exact, smaller, and explicit about the
  assumption. The library would be a transitive dependency we don't
  need.
- **Configurable quiet-hours in `/admin/settings`.** Rejected for v1:
  YAGNI. If we ever operate a second location with different hours,
  add the setting then. For now `21h–9h` is a sensible default
  hard-coded in the policy module.

## Operational notes

- The Casablanca offset and the quiet-hours window are exported from
  the policy module (`CASA_OFFSET_MINUTES`, `QUIET_HOUR_START`,
  `QUIET_HOUR_END`). The PaymentModal duplicates the quiet-hours
  check client-side for the dynamic label — keep both in sync if you
  retune.
- A deferred SMS persists in BullMQ as a `delayed` job. It is visible
  in `/admin/queues` (SUPERADMIN). If the worker cron is down for an
  extended period, deferred jobs accumulate and will all fire on the
  next worker tick after 09:00.
- The SmsLog dedup window (24h) still applies at delivery time. A
  series of identical-content COMPTA SMS queued during one night
  collapses to one at 09:00.
- If a client phone is changed mid-night between two compta SMS
  sends, the second send to the new number is a different
  `(phone, contentHash)` pair → both are delivered. Acceptable
  edge case.
