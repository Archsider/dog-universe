# Real-time transactional notifications

## Why
On Vercel Hobby, the BullMQ worker only runs once per minute via cron. Queued
transactional notifications (booking confirmation, validation, etc.) were
arriving batched with up-to-1-minute latency. Users complained about delays.

## Decision matrix

| Trigger                                | Helper                       | Backend          |
|----------------------------------------|------------------------------|------------------|
| User action (booking, validation, photo, claim, message, invoice) | `sendEmailNow` / `sendSmsNow` | Direct fire-and-forget |
| Cron batch (reminders, birthdays, reviews, overdue, weekly)      | `enqueueEmail` / `enqueueSms` | BullMQ + DLQ      |

## `sendEmailNow` / `sendSmsNow` — fire-and-forget contract
- Returns synchronously (`void`). The HTTP handler never awaits it.
- 3 attempts with backoff (0s, 1s, 3s).
- Final failure logs a structured error (PII-masked); never throws.
- Located in `src/lib/notify-now.ts`.

## Pattern
```ts
import { sendEmailNow } from '@/lib/notify-now';

// Inside a route handler
sendEmailNow({ to: client.email, subject, html });
return NextResponse.json({ ok: true });
```

Never `await` it inside a request handler — that defeats the point. If you
need delivery guarantees with retry/DLQ, use `enqueueEmail` instead (cron
will dispatch within 1 minute).
