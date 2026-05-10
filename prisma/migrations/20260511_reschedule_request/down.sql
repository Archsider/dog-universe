-- Rollback for 20260511_reschedule_request.
-- Drops the RescheduleRequest table (cascades indexes + FK).
DROP TABLE IF EXISTS "RescheduleRequest" CASCADE;
