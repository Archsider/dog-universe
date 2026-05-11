# `booking-admin/` — services for the admin booking PATCH route

This folder holds the per-discriminator-branch services consumed by
`src/app/api/admin/bookings/[id]/route.ts`. The route file is a thin
dispatcher (auth, version lock, body validation, error mapping). All
business logic lives here.

## Layout

| File | Branch | Responsibility |
|------|--------|----------------|
| `schemas.ts` | — | Zod schema for the PATCH body (strict whitelist of discriminator names) and the shared `VALID_BOOKING_STATUSES` enum. |
| `extension.ts` | `approveExtension` (merge), `rejectExtension` (merge), `extendEndDate`, `approveExtension` (flag) | Both extension models: separate `PENDING_EXTENSION` booking merging and in-place `endDate` extension. |
| `edit-dates.ts` | `editDates` | Admin corrects start/end dates and regenerates the BOARDING price + linked invoice items. |
| `status-transitions.ts` | `status` | `applyStatusUpdate` (the DB write, Sentry-spanned), `handleNoShowInvoice` (NO_SHOW invoice + product restock), `runStatusSideEffects` (notifications, email/SMS, audit log, loyalty, waitlist promotion). |
| `index.ts` | — | Barrel that re-exports everything plus the pre-existing services (`patchBoardingDetail`, `addBookingItems`, `rejectExtensionRequest`) from the legacy umbrella file. |

The legacy `../booking-admin.service.ts` continues to host
`patchBoardingDetail`, `addBookingItems`, and `rejectExtensionRequest`
(flag-based extension rejection without a separate booking). Those were
not moved to keep this PR a pure refactor — re-exported via `index.ts`.

## Contract

Each service:
1. Takes a typed input object (no `Request`, no `NextResponse`).
2. Returns a JSON-serialisable result object on success.
3. Throws `BookingError` (from `../booking-errors`) with a stable `code`
   on failure. The route layer maps `BookingError` to HTTP status + JSON.

## Adding a new branch

1. Add the discriminator name to `adminBookingPatchSchema` in `schemas.ts`.
2. Create a new `<branch>.ts` file in this folder that exports an async
   service function returning a JSON result and throwing `BookingError`.
3. Re-export from `index.ts`.
4. Add a dispatch block in `route.ts` — keep it shallow: validate the
   payload, call the service, catch `BookingError`, return JSON.

## Why we split this way

Before the split the route file was 1059 lines mixing dispatch, business
logic, capacity TOCTOU handling, NO_SHOW invoice handling, loyalty
recalculation and notification fan-out. With one service per branch
each piece is independently testable and the route file stays a router
(~280 lines, mostly dispatch + auth/version/status guards).
