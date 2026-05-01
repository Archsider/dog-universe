-- Composite indexes for hot read paths (cron dedup + capacity overlap queries)
CREATE INDEX IF NOT EXISTS "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Booking_status_startDate_idx" ON "Booking"("status", "startDate");
CREATE INDEX IF NOT EXISTS "Booking_status_endDate_idx" ON "Booking"("status", "endDate");
