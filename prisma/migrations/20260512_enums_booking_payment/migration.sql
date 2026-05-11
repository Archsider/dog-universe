-- @safety: reviewed
-- Ajoute des Postgres ENUMs pour les colonnes status/serviceType/paymentMethod.
-- Migre les données existantes via USING ... ::enum.
-- Les valeurs présentes en DB doivent toutes figurer dans l'enum correspondant
-- sans quoi le cast échoue (contrainte de migration safe-first).
--
-- Rollback : voir down.sql (cast back vers text, DROP TYPE).

BEGIN;

-- ── 1. Booking.status ────────────────────────────────────────────────────────
-- Valeurs connues (code + schema) :
-- PENDING | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED | REJECTED
-- AT_PICKUP | NO_SHOW | WAITLIST | PENDING_EXTENSION
CREATE TYPE booking_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'AT_PICKUP',
  'NO_SHOW',
  'WAITLIST',
  'PENDING_EXTENSION'
);

ALTER TABLE "Booking"
  ALTER COLUMN status TYPE booking_status
  USING status::booking_status;

-- ── 2. Booking.serviceType ───────────────────────────────────────────────────
CREATE TYPE booking_service_type AS ENUM (
  'BOARDING',
  'PET_TAXI'
);

ALTER TABLE "Booking"
  ALTER COLUMN "serviceType" TYPE booking_service_type
  USING "serviceType"::booking_service_type;

-- ── 3. Payment.paymentMethod ─────────────────────────────────────────────────
-- Valeurs connues (VALID_PAYMENT_METHODS + UI dropdowns) :
-- CASH | CARD | CHECK | TRANSFER
CREATE TYPE payment_method AS ENUM (
  'CASH',
  'CARD',
  'CHECK',
  'TRANSFER'
);

ALTER TABLE "Payment"
  ALTER COLUMN "paymentMethod" TYPE payment_method
  USING "paymentMethod"::payment_method;

-- ── 4. Invoice.status ────────────────────────────────────────────────────────
CREATE TYPE invoice_status AS ENUM (
  'PENDING',
  'PAID',
  'CANCELLED',
  'PARTIALLY_PAID'
);

ALTER TABLE "Invoice"
  ALTER COLUMN status TYPE invoice_status
  USING status::invoice_status;

COMMIT;
