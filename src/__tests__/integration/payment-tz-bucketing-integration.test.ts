/**
 * Real-Postgres regression test for the Casa-TZ payment bucketing fix.
 *
 * Context (Bug TZ round 3, 2026-05-18) :
 *   Payment.paymentDate is stored as `timestamp WITHOUT time zone`. The JS
 *   layer writes ISO UTC. The PG function `compute_payment_by_category`
 *   was applying `AT TIME ZONE 'Africa/Casablanca'` on the naive UTC
 *   timestamp, which Postgres interprets as "this naive IS Casa local,
 *   give me UTC". For a paymentDate stored as `2026-05-01 00:00:00` (the
 *   user clicked "1 mai" in the UI, JS wrote midnight UTC, Prisma
 *   stripped tz), the function was returning month=4 (April) instead of
 *   month=5 (May). That cost us 1950 MAD in DU-2026-0033 being bucketed
 *   in the wrong month.
 *
 * The fix (migration 20260518_fix_function_tz_casa) wraps the cast as
 *   `(paymentDate AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'`
 * so Postgres first interprets the naive as UTC, then converts to Casa
 * local.
 *
 * This test runs the function against a real Postgres (CI service
 * container or a developer's INTEGRATION_DATABASE_URL) with a fixture
 * payment at the 1st-of-month boundary. It MUST report month=May. The
 * test rolls back via savepoint so nothing leaks.
 *
 * Skip mode : if INTEGRATION_DATABASE_URL is unset, the suite skips
 * silently — same pattern as the SMS dedup integration test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const INTEGRATION_URL = process.env.INTEGRATION_DATABASE_URL;

const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

describeIntegration('compute_payment_by_category — Casa TZ bucketing', () => {
  let client: PrismaClient;

  beforeAll(() => {
    client = new PrismaClient({
      datasources: { db: { url: INTEGRATION_URL } },
    });
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(async () => {
    await client.$executeRawUnsafe('SAVEPOINT test_start');
  });

  afterEach(async () => {
    await client.$executeRawUnsafe('ROLLBACK TO SAVEPOINT test_start');
  });

  it('paymentDate "2026-05-01 00:00:00" (UTC stored naive = user clicked 1 mai) buckets in May Casa', async () => {
    // Create a minimal fixture : User → Booking → Invoice → InvoiceItem → Payment.
    // Use deterministic CUIDs so failures are easier to debug.
    const tag = `tz-test-${Date.now()}`;
    const userId = `u_${tag}`;
    const bookingId = `b_${tag}`;
    const invoiceId = `i_${tag}`;
    const itemId = `it_${tag}`;
    const paymentId = `p_${tag}`;

    await client.$executeRawUnsafe(
      `INSERT INTO "User"(id, email, name, role) VALUES ('${userId}', 'tz-test-${tag}@example.test', 'TZ Test', 'CLIENT')`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Booking"(id, "clientId", "startDate", "endDate", status, "serviceType", "totalPrice", "createdAt", "updatedAt") VALUES ('${bookingId}', '${userId}', '2026-05-01', '2026-05-03', 'COMPLETED', 'BOARDING', 240, NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Invoice"(id, "bookingId", "clientId", "invoiceNumber", amount, "paidAmount", status, "issuedAt", "createdAt", "updatedAt") VALUES ('${invoiceId}', '${bookingId}', '${userId}', 'TZ-${tag}', 240, 240, 'PAID', NOW(), NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "InvoiceItem"(id, "invoiceId", category, description, quantity, "unitPrice", total, "allocatedAmount") VALUES ('${itemId}', '${invoiceId}', 'BOARDING', 'Test boarding', 2, 120, 240, 240)`,
    );
    // The smoking gun : paymentDate stored as UTC midnight on 1 mai 2026.
    // Pre-fix function returned month=4 (April). Post-fix must return 5 (May).
    await client.$executeRawUnsafe(
      `INSERT INTO "Payment"(id, "invoiceId", amount, "paymentDate", "paymentMethod", "createdAt") VALUES ('${paymentId}', '${invoiceId}', 240, '2026-05-01 00:00:00', 'CASH', NOW())`,
    );

    const rows = await client.$queryRawUnsafe<Array<{ year: number; month: number; total: string }>>(
      `SELECT year, month, total::text FROM compute_payment_by_category(2026, 5) WHERE category = 'boarding'`,
    );

    const matching = rows.find((r) => Number(r.total) === 240);
    expect(matching, 'Expected the 240 MAD payment to be bucketed in May Casa').toBeDefined();
    expect(matching!.year).toBe(2026);
    expect(matching!.month).toBe(5);

    // Negative assertion : ensure April 2026 does NOT contain this payment.
    const april = await client.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT total::text FROM compute_payment_by_category(2026, 4) WHERE category = 'boarding'`,
    );
    const leakedToApril = april.find((r) => Number(r.total) === 240);
    expect(leakedToApril, 'Payment must NOT leak into April Casa').toBeUndefined();
  });

  it('paymentDate "2026-05-31 23:30:00" (UTC late evening = 2 juin Casa) buckets in June Casa', async () => {
    // Symmetric boundary case : a payment at 23:30 UTC on May 31 is
    // actually 00:30 Casa on June 1. The post-fix function must bucket
    // it in June, not May.
    const tag = `tz-test2-${Date.now()}`;
    const userId = `u_${tag}`;
    const bookingId = `b_${tag}`;
    const invoiceId = `i_${tag}`;
    const itemId = `it_${tag}`;
    const paymentId = `p_${tag}`;

    await client.$executeRawUnsafe(
      `INSERT INTO "User"(id, email, name, role) VALUES ('${userId}', 'tz-test-${tag}@example.test', 'TZ Test 2', 'CLIENT')`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Booking"(id, "clientId", "startDate", "endDate", status, "serviceType", "totalPrice", "createdAt", "updatedAt") VALUES ('${bookingId}', '${userId}', '2026-05-30', '2026-06-01', 'COMPLETED', 'BOARDING', 120, NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Invoice"(id, "bookingId", "clientId", "invoiceNumber", amount, "paidAmount", status, "issuedAt", "createdAt", "updatedAt") VALUES ('${invoiceId}', '${bookingId}', '${userId}', 'TZ2-${tag}', 120, 120, 'PAID', NOW(), NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "InvoiceItem"(id, "invoiceId", category, description, quantity, "unitPrice", total, "allocatedAmount") VALUES ('${itemId}', '${invoiceId}', 'BOARDING', 'Test boarding 2', 1, 120, 120, 120)`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Payment"(id, "invoiceId", amount, "paymentDate", "paymentMethod", "createdAt") VALUES ('${paymentId}', '${invoiceId}', 120, '2026-05-31 23:30:00', 'CASH', NOW())`,
    );

    const june = await client.$queryRawUnsafe<Array<{ year: number; month: number; total: string }>>(
      `SELECT year, month, total::text FROM compute_payment_by_category(2026, 6) WHERE category = 'boarding'`,
    );
    const matching = june.find((r) => Number(r.total) === 120);
    expect(matching, 'Expected 23:30 UTC payment to be bucketed in June Casa (00:30 Casa)').toBeDefined();
    expect(matching!.month).toBe(6);
  });
});
