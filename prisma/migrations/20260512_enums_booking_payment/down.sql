-- Rollback : retire les ENUMs et restitue les colonnes TEXT.
-- Note : les valeurs ENUM sont castées en TEXT sans perte d'information.

BEGIN;

-- ── 4. Invoice.status → TEXT ─────────────────────────────────────────────────
ALTER TABLE "Invoice"
  ALTER COLUMN status TYPE TEXT
  USING status::TEXT;

DROP TYPE IF EXISTS invoice_status;

-- ── 3. Payment.paymentMethod → TEXT ──────────────────────────────────────────
ALTER TABLE "Payment"
  ALTER COLUMN "paymentMethod" TYPE TEXT
  USING "paymentMethod"::TEXT;

DROP TYPE IF EXISTS payment_method;

-- ── 2. Booking.serviceType → TEXT ────────────────────────────────────────────
ALTER TABLE "Booking"
  ALTER COLUMN "serviceType" TYPE TEXT
  USING "serviceType"::TEXT;

DROP TYPE IF EXISTS booking_service_type;

-- ── 1. Booking.status → TEXT ─────────────────────────────────────────────────
ALTER TABLE "Booking"
  ALTER COLUMN status TYPE TEXT
  USING status::TEXT;

DROP TYPE IF EXISTS booking_status;

DELETE FROM "_app_migrations" WHERE name = '20260512_enums_booking_payment';

COMMIT;
