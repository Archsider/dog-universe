-- @rollback: not-applicable
--
-- Backfill: migrate the legacy non-canonical taxi status 'ARRIVED_AT_DESTINATION'
-- (written by the geofence auto-transition) to the canonical terminals that
-- every consumer recognises: 'ARRIVED_AT_PENSION' (OUTBOUND/STANDALONE) and
-- 'ARRIVED_AT_CLIENT' (RETURN).
--
-- Why: history / dashboard "today" / board kanban / driver dashboard all treat
-- only ('ARRIVED_AT_PENSION','ARRIVED_AT_CLIENT') as terminal. Trips auto-
-- completed by geofence got stuck 'ARRIVED_AT_DESTINATION' → permanently shown
-- as "active" (zombie) AND excluded from history forever.
--
-- Rollback is not-applicable: renaming back to 'ARRIVED_AT_DESTINATION' would
-- be ambiguous (it cannot distinguish migrated rows from legitimately-canonical
-- ones) and would re-introduce the bug. Idempotent — safe to re-run.

-- 1) Stop tracking on the affected (now-terminal) trips + invalidate links.
UPDATE "TaxiTrip"
   SET "trackingActive" = false, "trackingToken" = NULL
 WHERE status = 'ARRIVED_AT_DESTINATION';

-- 2) Rename TaxiTrip.status to the canonical terminal per trip direction.
UPDATE "TaxiTrip"
   SET status = 'ARRIVED_AT_CLIENT'
 WHERE status = 'ARRIVED_AT_DESTINATION' AND "tripType" = 'RETURN';

UPDATE "TaxiTrip"
   SET status = 'ARRIVED_AT_PENSION'
 WHERE status = 'ARRIVED_AT_DESTINATION' AND "tripType" IN ('OUTBOUND', 'STANDALONE');

-- Fallback for any unexpected tripType — pension is the safe default.
UPDATE "TaxiTrip"
   SET status = 'ARRIVED_AT_PENSION'
 WHERE status = 'ARRIVED_AT_DESTINATION';

-- 3) Complete STANDALONE bookings whose taxi already arrived but were left
--    IN_PROGRESS because the auto path never synced Booking.status.
UPDATE "Booking" b
   SET status = 'COMPLETED'
  FROM "TaxiTrip" t
 WHERE t."bookingId" = b.id
   AND t."tripType" = 'STANDALONE'
   AND t.status IN ('ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT')
   AND b.status = 'IN_PROGRESS';

-- 4) Align the history trail (cosmetic — keeps the replay timeline consistent).
UPDATE "TaxiStatusHistory" h
   SET status = 'ARRIVED_AT_CLIENT'
  FROM "TaxiTrip" t
 WHERE h."taxiTripId" = t.id
   AND h.status = 'ARRIVED_AT_DESTINATION'
   AND t."tripType" = 'RETURN';

UPDATE "TaxiStatusHistory" h
   SET status = 'ARRIVED_AT_PENSION'
  FROM "TaxiTrip" t
 WHERE h."taxiTripId" = t.id
   AND h.status = 'ARRIVED_AT_DESTINATION'
   AND t."tripType" IN ('OUTBOUND', 'STANDALONE');

UPDATE "TaxiStatusHistory"
   SET status = 'ARRIVED_AT_PENSION'
 WHERE status = 'ARRIVED_AT_DESTINATION';
