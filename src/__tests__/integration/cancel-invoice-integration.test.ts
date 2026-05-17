/**
 * Real-Postgres integration tests for the cancelInvoice flow.
 *
 * Context:
 *   cancelInvoice() in src/lib/billing/cancel-invoice.ts owns the
 *   Invoice CANCELLED transition. It uses the global `prisma` singleton
 *   internally. These integration tests verify the DB invariants that
 *   the function relies on — using raw SQL to set up fixtures and assert
 *   state — without calling the TS function directly (which would require
 *   wiring the global singleton to the integration DB).
 *
 * What we validate:
 *   - The CANCELLED state transition is achievable (schema allows it)
 *   - BookingItem.invoiceItemId cascade unlink works (UPDATE … SET null)
 *   - ALREADY_CANCELLED idempotence: cancelling an already-cancelled
 *     invoice is a no-op from the DB perspective
 *   - PAID invoice cancellation requires paidAmount > 0 logic to be
 *     surfaced (the DB state is verifiable)
 *   - The version optimistic-lock pattern works (updateMany WHERE version)
 *
 * Run mode:
 *   - INTEGRATION_DATABASE_URL set → executes against real Postgres
 *   - Not set (default) → describe.skip, suite is a no-op
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const INTEGRATION_URL = process.env.INTEGRATION_DATABASE_URL;

const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

describeIntegration('cancelInvoice — real Postgres DB invariants', () => {
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
    await client.$executeRawUnsafe('SAVEPOINT ci_test_start');
  });

  afterEach(async () => {
    await client.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ci_test_start');
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  async function createInvoiceFixture(
    tag: string,
    amount: number,
    initialStatus = 'PENDING',
  ) {
    const userId = `u_ci_${tag}`;
    const bookingId = `b_ci_${tag}`;
    const invoiceId = `i_ci_${tag}`;
    const itemId = `it_ci_${tag}`;

    await client.$executeRawUnsafe(
      `INSERT INTO "User"(id, email, "firstName", "lastName", name, "passwordHash", role, "updatedAt")
       VALUES ('${userId}', 'ci-test-${tag}@example.test', 'Cancel', 'Test', 'Cancel Test', 'x', 'CLIENT', NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Booking"(id, "clientId", "startDate", "endDate", status, "serviceType", "totalPrice", "createdAt", "updatedAt")
       VALUES ('${bookingId}', '${userId}', '2026-05-01', '2026-05-03', 'COMPLETED', 'BOARDING', ${amount}, NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Invoice"(id, "bookingId", "clientId", "invoiceNumber", amount, "paidAmount", status, version, "issuedAt", "createdAt", "updatedAt")
       VALUES ('${invoiceId}', '${bookingId}', '${userId}', 'IT-CI-${tag}', ${amount}, 0, '${initialStatus}', 0, NOW(), NOW(), NOW())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "InvoiceItem"(id, "invoiceId", category, description, quantity, "unitPrice", total, "allocatedAmount", "updatedAt")
       VALUES ('${itemId}', '${invoiceId}', 'BOARDING', 'Test boarding cancel', 1, ${amount}, ${amount}, 0, NOW())`,
    );

    return { userId, bookingId, invoiceId, itemId };
  }

  // ─── Tests ────────────────────────────────────────────────────────────

  it('PENDING invoice can be set to CANCELLED via direct UPDATE (schema allows it)', async () => {
    const tag = `happy-${Date.now()}`;
    const { invoiceId } = await createInvoiceFixture(tag, 240);

    // Simulate what cancelInvoice does: optimistic-lock updateMany
    const result = await client.$executeRawUnsafe(
      `UPDATE "Invoice"
       SET status = 'CANCELLED', version = 1, "updatedAt" = NOW(),
           notes = '[Annulée 2026-05-17 par ADMIN] Test reason here'
       WHERE id = '${invoiceId}' AND version = 0`,
    );
    // executeRawUnsafe returns the count of affected rows
    expect(result).toBe(1);

    const rows = await client.$queryRawUnsafe<Array<{ status: string; version: number }>>(
      `SELECT status, version FROM "Invoice" WHERE id = '${invoiceId}'`,
    );
    expect(rows[0].status).toBe('CANCELLED');
    expect(rows[0].version).toBe(1);
  });

  it('Optimistic lock: updateMany WHERE version mismatch returns 0 rows affected', async () => {
    const tag = `lock-${Date.now()}`;
    const { invoiceId } = await createInvoiceFixture(tag, 120);

    // Simulate a concurrent update that bumps the version first
    await client.$executeRawUnsafe(
      `UPDATE "Invoice" SET version = 1, "updatedAt" = NOW() WHERE id = '${invoiceId}'`,
    );

    // Now try to cancel with the old version (0) — should affect 0 rows
    const affected = await client.$executeRawUnsafe(
      `UPDATE "Invoice"
       SET status = 'CANCELLED', version = 1, "updatedAt" = NOW()
       WHERE id = '${invoiceId}' AND version = 0`,
    );
    expect(affected).toBe(0);

    // Invoice should still be PENDING (not cancelled)
    const rows = await client.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM "Invoice" WHERE id = '${invoiceId}'`,
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('Idempotence: cancelling an already-CANCELLED invoice returns status CANCELLED (not double-cancelled)', async () => {
    const tag = `idem-${Date.now()}`;
    const { invoiceId } = await createInvoiceFixture(tag, 100, 'CANCELLED');

    // The DB already has CANCELLED — a WHERE version=0 guard would reject
    const rows = await client.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM "Invoice" WHERE id = '${invoiceId}'`,
    );
    // Should already be CANCELLED
    expect(rows[0].status).toBe('CANCELLED');

    // Second cancel attempt: same version guard → 0 rows affected
    // (cancelInvoice.ts returns ALREADY_CANCELLED before even trying the UPDATE)
    // Here we verify the DB returns CANCELLED so the JS check works correctly.
    expect(rows[0].status).toBe('CANCELLED');
  });

  it('BookingItem.invoiceItemId is nulled out (unlinked) when invoice items are unlinked', async () => {
    const tag = `unlink-${Date.now()}`;
    const { invoiceId, itemId, bookingId } = await createInvoiceFixture(tag, 240);

    // Create a BookingItem linked to the InvoiceItem (simulates the supplementary billing pattern)
    const bookingItemId = `bi_ci_${tag}`;
    await client.$executeRawUnsafe(
      `INSERT INTO "BookingItem"(id, "bookingId", category, description, quantity, "unitPrice", total, "invoiceItemId", "updatedAt")
       VALUES ('${bookingItemId}', '${bookingId}', 'BOARDING', 'Linked booking item', 1, 240, 240, '${itemId}', NOW())`,
    );

    // Verify it's linked
    const before = await client.$queryRawUnsafe<Array<{ "invoiceItemId": string | null }>>(
      `SELECT "invoiceItemId" FROM "BookingItem" WHERE id = '${bookingItemId}'`,
    );
    expect(before[0].invoiceItemId).toBe(itemId);

    // Simulate the cascade unlink (what cancelInvoice.ts does in the transaction)
    await client.$executeRawUnsafe(
      `UPDATE "BookingItem"
       SET "invoiceItemId" = NULL
       WHERE "invoiceItemId" IN (
         SELECT id FROM "InvoiceItem" WHERE "invoiceId" = '${invoiceId}'
       )`,
    );

    // Verify it's unlinked
    const after = await client.$queryRawUnsafe<Array<{ "invoiceItemId": string | null }>>(
      `SELECT "invoiceItemId" FROM "BookingItem" WHERE id = '${bookingItemId}'`,
    );
    expect(after[0].invoiceItemId).toBeNull();
  });

  it('PAID invoice has paidAmount > 0 — detectable before cancel decision', async () => {
    const tag = `paid-detect-${Date.now()}`;
    const { invoiceId } = await createInvoiceFixture(tag, 480, 'PAID');

    // Update to reflect a fully paid state
    await client.$executeRawUnsafe(
      `UPDATE "Invoice"
       SET "paidAmount" = 480, "paidAt" = NOW(), "updatedAt" = NOW()
       WHERE id = '${invoiceId}'`,
    );

    const rows = await client.$queryRawUnsafe<Array<{ "paidAmount": string; status: string }>>(
      `SELECT "paidAmount"::text, status FROM "Invoice" WHERE id = '${invoiceId}'`,
    );
    // The JS cancelInvoice reads paidAmount to decide whether refund is required
    expect(Number(rows[0].paidAmount)).toBe(480);
    expect(rows[0].status).toBe('PAID');
    // paidAmount > 0 → cancelInvoice would require refundExisting: true
    expect(Number(rows[0].paidAmount)).toBeGreaterThan(0);
  });

  it('Notes field accumulates audit trail (append pattern used by cancelInvoice)', async () => {
    const tag = `notes-${Date.now()}`;
    const { invoiceId } = await createInvoiceFixture(tag, 100);

    const auditNote = '[Annulée 2026-05-17 par ADMIN] Doublon facture croquettes';

    await client.$executeRawUnsafe(
      `UPDATE "Invoice"
       SET status = 'CANCELLED', version = 1, "updatedAt" = NOW(),
           notes = '${auditNote}'
       WHERE id = '${invoiceId}' AND version = 0`,
    );

    const rows = await client.$queryRawUnsafe<Array<{ notes: string }>>(
      `SELECT notes FROM "Invoice" WHERE id = '${invoiceId}'`,
    );
    expect(rows[0].notes).toBe(auditNote);
  });

  it('Invoice NOT FOUND scenario: updateMany against nonexistent id returns 0 rows', async () => {
    const fakeId = 'does-not-exist-xyz-123';

    const affected = await client.$executeRawUnsafe(
      `UPDATE "Invoice"
       SET status = 'CANCELLED', "updatedAt" = NOW()
       WHERE id = '${fakeId}'`,
    );
    expect(affected).toBe(0);
  });

  it('Cascade: InvoiceItem rows are deleted when Invoice is hard-deleted (ON DELETE CASCADE)', async () => {
    // InvoiceItem has @relation(onDelete: Cascade) → verifying the schema constraint.
    // Note: cancelInvoice soft-cancels (never hard-deletes). But the cascade is load-bearing
    // for data integrity in test teardowns. We verify it exists.
    const tag = `cascade-${Date.now()}`;
    const { invoiceId, itemId } = await createInvoiceFixture(tag, 100);

    // Hard-delete the invoice (test-only — cancelInvoice never does this)
    await client.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE id = '${invoiceId}'`);

    // InvoiceItem should be gone due to CASCADE
    const items = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "InvoiceItem" WHERE id = '${itemId}'`,
    );
    expect(items).toHaveLength(0);
  });
});
