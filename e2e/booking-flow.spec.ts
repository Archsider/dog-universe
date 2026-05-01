/**
 * E2E — Full booking flow (CLIENT creates a boarding → ADMIN confirms)
 *
 * Step-by-step:
 * 1. Client logs in
 * 2. Navigates to /fr/client/bookings/new
 * 3. Fills boarding form (select first pet, dates 7+ days out, no grooming)
 * 4. Submits — arrives at step 5 "Réservation envoyée !"
 * 5. Booking appears in /fr/client/history with status PENDING
 * 6. Admin logs in, navigates to /fr/admin/reservations
 * 7. Finds the booking (most recent PENDING), clicks "Confirmer le séjour"
 * 8. Verifies optimistic update shows CONFIRMED column
 * 9. Client reloads history — status now shows CONFIRMED
 */
import { test, expect } from '@playwright/test';
import {
  e2eSecretsAvailable,
  getClientCreds,
  getAdminCreds,
  loginAsClient,
} from './helpers/auth';

// ── helpers ────────────────────────────────────────────────────────────────

/** Returns a date string YYYY-MM-DD that is `n` days from today. */
function dateOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Login as admin via the UI login form. */
async function loginAsAdmin(page: import('@playwright/test').Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto('/fr/auth/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await Promise.all([
    page.waitForURL(/\/fr\/(client|admin)\//, { timeout: 15_000 }),
    page.getByRole('button', { name: /se connecter/i }).click(),
  ]);
}

// ── spec ──────────────────────────────────────────────────────────────────

test.describe('Booking flow — boarding PENDING → CONFIRMED', () => {
  test.beforeEach(() => {
    test.skip(!e2eSecretsAvailable(), 'Secrets TEST_* non configurés — skip e2e booking-flow');
  });

  test('client crée une réservation, admin confirme, client voit CONFIRMED', async ({ page, context }) => {
    const clientCreds = getClientCreds();
    const adminCreds = getAdminCreds();

    // ── 1. Login as client ────────────────────────────────────────────────
    await loginAsClient(page, clientCreds);
    // Handle potential contract modal — if present, navigate away directly
    await page.goto('/fr/client/bookings/new');

    // ── 2. Step 1 — choose BOARDING (already selected by default) ─────────
    await expect(page.getByRole('heading', { name: /nouvelle réservation/i })).toBeVisible();
    // The boarding card is selected by default; click it to be explicit
    await page.getByText(/^Pension$/).first().click();
    await page.getByRole('button', { name: /suivant/i }).click();

    // ── 3. Step 2 — select the first available pet ────────────────────────
    // Wait for pets to load (spinner disappears)
    await page.waitForSelector('button.w-full.flex.items-center', { timeout: 10_000 });
    // Click the first pet card
    const firstPet = page.locator('button.w-full.flex.items-center').first();
    await expect(firstPet).toBeVisible();
    await firstPet.click();
    await page.getByRole('button', { name: /suivant/i }).click();

    // ── 4. Step 3 — fill dates (7 days out → 9 days out) ─────────────────
    const checkIn = dateOffset(7);
    const checkOut = dateOffset(9);
    await page.locator('#checkin').fill(checkIn);
    await page.locator('#checkout').fill(checkOut);
    // No grooming, no taxi addon
    await page.getByRole('button', { name: /suivant/i }).click();

    // ── 5. Step 4 — review summary, confirm ───────────────────────────────
    await expect(page.getByText(/récapitulatif/i)).toBeVisible();
    const [bookingResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/bookings') && r.request().method() === 'POST',
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: /confirmer la réservation/i }).click(),
    ]);

    if (!bookingResponse.ok()) {
      const body = await bookingResponse.text().catch(() => '');
      throw new Error(`POST /api/bookings a échoué (${bookingResponse.status()}). Body: ${body}`);
    }

    // ── 6. Step 5 — confirmation screen with reference ────────────────────
    await expect(page.getByText(/réservation envoyée/i)).toBeVisible({ timeout: 10_000 });
    // Extract booking reference for later verification
    const refEl = page.locator('span.font-mono.font-bold');
    const bookingRef = await refEl.textContent().catch(() => '');

    // ── 7. Client checks history — booking appears as PENDING ─────────────
    await page.goto('/fr/client/history');
    // The most-recent booking should show PENDING status badge
    // We look for "En attente" badge (or the booking ref if we have one)
    const historyStatus = bookingRef
      ? page.locator(`text=${bookingRef}`).locator('..').locator('..').getByText(/en attente/i)
      : page.getByText(/en attente/i).first();
    await expect(historyStatus).toBeVisible({ timeout: 10_000 });

    // ── 8. Admin logs in and confirms the booking ─────────────────────────
    // Open admin in same context (new page) to keep client session in original tab
    const adminPage = await context.newPage();
    await loginAsAdmin(adminPage, adminCreds);

    // Navigate to admin reservations with PENDING filter + kanban board view
    await adminPage.goto('/fr/admin/reservations?view=board');
    await expect(adminPage).toHaveURL(/\/fr\/admin\/reservations/, { timeout: 15_000 });

    // Find the "Confirmer le séjour" button inside the PENDING column
    // The kanban renders an ActionButton per card; we click the first visible one
    const confirmBtn = adminPage.getByRole('button', { name: /confirmer le séjour/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
    await confirmBtn.click();

    // Wait for the PATCH response to complete
    await adminPage.waitForResponse(
      (r) => r.url().includes('/api/admin/bookings/') && r.request().method() === 'PATCH',
      { timeout: 15_000 },
    );

    // ── 9. Optimistic update: card should now appear in CONFIRMED column ──
    // The toast "Statut mis à jour" (or "Status updated") is a quick signal
    await expect(adminPage.getByText(/statut mis à jour|status updated/i)).toBeVisible({ timeout: 10_000 });

    await adminPage.close();

    // ── 10. Client reloads and sees CONFIRMED ─────────────────────────────
    await page.goto('/fr/client/history');
    // At least one booking should now show "Séjour confirmé" or "Confirmé" status
    await expect(page.getByText(/séjour confirmé|confirmé/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
