# Client messages — architecture & pipeline

> One canonical pipeline for **every** message an admin sends to a client
> (free-form, end-of-stay report, future templates). The Notification table
> is the single source of truth ; soft-delete is supported on
> admin-initiated messages only.

## Canonical pipeline

```
   Admin UI (AdminMessageSection or /end-report form)
                  │
                  ▼
   POST /api/admin/bookings/[id]/message            (free-form)
        /api/admin/bookings/[id]/end-report         (structured)
                  │
                  ▼
   createAdminMessageNotification()                 (free-form)
   createEndStayReportNotification()                (end-of-stay)
                  │
                  ▼
   Notification row inserted
     type     = ADMIN_MESSAGE | END_STAY_REPORT
     userId   = client.id
     metadata = { bookingId, [reportId for end-stay] }
                  │
                  ▼
   sendEmailNow() fire-and-forget                   (email parallel)
```

End-stay reports additionally persist structured `formData` in
`EndStayReport` table (separate from `Notification` so we can query / edit /
version / feed-AI later — see docs/END_STAY_REPORT_AI.md).

## Notification types relevant here

| Type | Audience | Soft-deletable | Created via |
|---|---|---|---|
| `ADMIN_MESSAGE` | client | ✅ | `POST /api/admin/bookings/[id]/message` |
| `END_STAY_REPORT` | client | ✅ | `POST /api/admin/bookings/[id]/end-report` |
| `STAY_PHOTO`, `BOOKING_*`, etc | client | ❌ | system events |
| `STAY_REMINDER`, `REVIEW_REQUEST`, etc | client | ❌ | crons |

**Soft-delete is gated on the type.** The DELETE endpoint refuses to
soft-delete anything other than `ADMIN_MESSAGE` and `END_STAY_REPORT` —
system-generated rows represent real events and must not disappear from
the client's view.

## Soft-delete (added 2026-05-15)

### Schema

`Notification` gained two columns: `deletedAt: DateTime?`, `deletedBy: String?`
(admin userId). One index on `deletedAt` for query speed.

### Behaviour

- **Client view** : queries filter `deletedAt: null`. The message
  disappears from the bell badge count + notifications page within 30 s
  (cache TTL on the unread count) once the admin clicks Trash.
- **Admin view** : `/admin/reservations/[id]` keeps showing deleted
  messages struck-through with the label `Supprimé par <admin> le <date>`
  — full audit trail without leaving the page.

### Audit

Every delete writes an `ActionLog` entry with `action='NOTIFICATION_DELETED'`
and `details.payloadBefore = { messageFr, messageEn, createdAt }`. Even
if the Notification row is eventually hard-purged by RGPD cleanup, the
audit trail in `ActionLog` survives separately.

### Endpoint

```
DELETE /api/admin/bookings/[id]/messages/[messageId]
  Auth   : ADMIN | SUPERADMIN
  204/200: { deleted: true }                  on first delete
  200    : { deleted: true, alreadyDeleted: true }
  400    : NOT_DELETABLE  (system notification type)
  400    : MISMATCH       (URL bookingId ≠ metadata.bookingId)
  404    : Not found
```

## End-of-stay report (added 2026-05-15)

See `docs/END_STAY_REPORT_AI.md` for the future AI workflow. The current
step-1 (manual template) implementation:

1. Admin opens `/admin/reservations/[id]/end-report` from a CTA banner
   on the booking detail page. The banner is gated on `status === COMPLETED`
   OR (`status === IN_PROGRESS` AND `endDate <= today + 1`).
2. Fills 5 sections (behaviour / food / sleep / activities / health) with
   checkboxes + free text + closing note. Live preview on the right.
3. Send button DISABLED unless at least one section has content
   (`isFormReadyToSend`).
4. Modal confirmation showing destination client name + email —
   anti-drame guard against "wrong owner" sends.
5. On send → `EndStayReport` row + Notification (`END_STAY_REPORT`) +
   email via the existing pipeline.

The pure renderer (`src/lib/end-stay-report.ts → buildEndStayReportMessage`)
is the SAME function used by the live preview AND the server endpoint.
Same input → same output. Zero risk of drift.

## Re-sending a report

The UI shows a banner "Un rapport a déjà été envoyé le X par Y" but does
NOT block. Clicking Send again creates a new `EndStayReport` row + new
Notification. The admin always sees the full history on the booking page.

## Operational notes

- **Cache invalidation** : the DELETE endpoint calls `invalidateNotifCount(userId)`
  so the bell badge updates immediately (next 30 s tick); otherwise the
  badge would lag up to its TTL.
- **Email retry** : `sendEmailNow` is fire-and-forget (3 retries internally).
  If all retries fail, the in-app Notification is still there — the client
  reads the message on the next app open.
- **No PII in audit** : `ActionLog.details.payloadBefore` is the full
  message body, considered customer-facing data. Standard RGPD purge
  (`/api/cron/purge-anonymized`) removes ActionLog rows for anonymized
  users alongside their other data.
