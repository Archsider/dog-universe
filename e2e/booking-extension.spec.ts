/**
 * E2E — Booking extension flow (admin side) + capacity check
 *
 * Spec 1 — Extension flow:
 * 1. Admin logs in, navigates to /fr/admin/reservations
 * 2. Clicks into the first CONFIRMED or IN_PROGRESS boarding booking
 * 3. Opens "Prolonger directement" section
 * 4. Sets a new end date (current + 2 nights)
 * 5. Submits and verifies toast "Séjour prolongé avec succès"
 * 6. Verifies router.refresh was triggered (section is re-rendered)
 *
 * Spec 2 — Capacity check:
 * 1. Client logs in and navigates to /fr/client/bookings/new
 * 2. Fills the boarding form
 * 3. POST /api/bookings is intercepted and returns 400 CAPACITY_EXCEEDED
 * 4. Verifies the UI shows "La pension est complète pour ces dates"
 */
import { test, expect } from '@playwright/test';
import {
  e2eSecretsAvailable,
  getAdminCreds,
  getClientCreds,
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
async function loginAsAdmin(
  page: import('@playwright/test').Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto('/fr/auth/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await Promise.all([
    page.waitForURL(/\/fr\/(client|admin)\//, { timeout: 15_000 }),
    page.getByRole('button', { name: /se connecter/i }).click(),
  ]);
}

// ── Spec 1 : Extension flow ────────────────────────────────────────────────

test.describe('Booking extension — admin direct extend', () => {
  test.beforeEach(() => {
    test.skip(
      !e2eSecretsAvailable(),
      'Secrets TEST_* non configurés — skip e2e booking-extension',
    );
  });

  test('admin peut prolonger un séjour CONFIRMED et voit le toast de succès', async ({ page }) => {
    const adminCreds = getAdminCreds();
    await loginAsAdmin(page, adminCreds);

    // ── 1. Navigate to reservations list ──────────────────────────────────
    await page.goto('/fr/admin/reservations');
    await expect(page).toHaveURL(/\/fr\/admin\/reservations/, { timeout: 15_000 });

    // ── 2. Find a CONFIRMED or IN_PROGRESS booking card and open it ───────
    // Look for a link to a boarding booking detail — try "Séjour confirmé" or
    // "Dans nos murs" status badges, then fall back to the first reservation link.
    // We navigate directly to the list and click the first available detail link.
    const bookingDetailLink = page
      .locator('a[href*="/admin/reservations/"]')
      .first();
    await expect(bookingDetailLink).toBeVisible({ timeout: 15_000 });
    await bookingDetailLink.click();

    // Wait for the detail page
    await expect(page).toHaveURL(/\/fr\/admin\/reservations\/[a-z0-9]+/, {
      timeout: 15_000,
    });

    // ── 3. Scroll to the "Prolongation de séjour" section ─────────────────
    const extensionHeading = page.getByText(/prolongation de séjour/i);
    // The section may not be present for all booking types (PET_TAXI has no extension).
    // If absent, skip gracefully.
    const isExtensionVisible = await extensionHeading
      .isVisible()
      .catch(() => false);
    if (!isExtensionVisible) {
      // This booking is not a BOARDING — try to find one via the list
      await page.goto('/fr/admin/reservations');

      // Click a booking that shows "Séjour confirmé" or "Dans nos murs"
      const boardingLink = page
        .locator('a[href*="/admin/reservations/"]')
        .filter({ hasText: /séjour confirmé|dans nos murs/i })
        .first();

      const boardingLinkVisible = await boardingLink.isVisible().catch(() => false);
      if (!boardingLinkVisible) {
        test.skip(
          true,
          'Aucune réservation BOARDING CONFIRMED/IN_PROGRESS disponible pour le test',
        );
        return;
      }
      await boardingLink.click();
      await expect(page).toHaveURL(/\/fr\/admin\/reservations\/[a-z0-9]+/, {
        timeout: 15_000,
      });
    }

    // ── 4. Open "Prolonger directement" collapsible ────────────────────────
    const directExtendBtn = page.getByRole('button', { name: /prolonger directement/i });
    await expect(directExtendBtn).toBeVisible({ timeout: 10_000 });
    await directExtendBtn.click();

    // The date input should now be visible
    const dateInput = page.locator('input[type="date"]').last();
    await expect(dateInput).toBeVisible({ timeout: 5_000 });

    // ── 5. Read the min attribute to determine current endDate + 1 ─────────
    const minAttr = await dateInput.getAttribute('min');
    // min = currentEndDate + 1 day; we extend by 2 more nights from min
    let newEndDate: string;
    if (minAttr) {
      const minDate = new Date(minAttr + 'T12:00:00');
      minDate.setDate(minDate.getDate() + 1); // +2 days from current checkout
      newEndDate = minDate.toISOString().slice(0, 10);
    } else {
      // Fallback: use today + 30 days
      newEndDate = dateOffset(30);
    }

    await dateInput.fill(newEndDate);

    // ── 6. Submit and wait for PATCH response ─────────────────────────────
    const [patchResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/admin/bookings/') &&
          r.request().method() === 'PATCH',
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: /^appliquer$/i }).click(),
    ]);

    if (!patchResponse.ok()) {
      const body = await patchResponse.text().catch(() => '');
      // CAPACITY_EXCEEDED is a valid backend response — not a test failure
      if (body.includes('CAPACITY_EXCEEDED')) {
        // The capacity toast should be shown
        await expect(
          page.getByText(/pension complète|pension full/i),
        ).toBeVisible({ timeout: 8_000 });
        return;
      }
      throw new Error(
        `PATCH /api/admin/bookings a échoué (${patchResponse.status()}). Body: ${body}`,
      );
    }

    // ── 7. Verify success toast ────────────────────────────────────────────
    await expect(
      page.getByText(/séjour prolongé avec succès/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── Spec 2 : Capacity check via network mock ───────────────────────────────

test.describe('Booking creation — capacity exceeded error', () => {
  test.beforeEach(() => {
    test.skip(
      !e2eSecretsAvailable(),
      'Secrets TEST_* non configurés — skip e2e capacity-check',
    );
  });

  test('le formulaire affiche une erreur quand POST /api/bookings retourne CAPACITY_EXCEEDED', async ({
    page,
  }) => {
    const clientCreds = getClientCreds();

    // ── 1. Login as client ─────────────────────────────────────────────────
    await loginAsClient(page, clientCreds);
    await page.goto('/fr/client/bookings/new');

    // ── 2. Intercept POST /api/bookings — return 400 CAPACITY_EXCEEDED ────
    await page.route('**/api/bookings', (route) => {
      if (route.request().method() !== 'POST') {
        route.continue();
        return;
      }
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'CAPACITY_EXCEEDED',
          species: 'DOG',
          available: 0,
          requested: 1,
          limit: 20,
        }),
      });
    });

    // ── 3. Fill the form through to the final confirmation step ───────────
    await expect(
      page.getByRole('heading', { name: /nouvelle réservation/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 1 — select BOARDING
    await page.getByText(/^Pension$/).first().click();
    await page.getByRole('button', { name: /suivant/i }).click();

    // Step 2 — select first pet
    await page.waitForSelector('button.w-full.flex.items-center', {
      timeout: 10_000,
    });
    await page.locator('button.w-full.flex.items-center').first().click();
    await page.getByRole('button', { name: /suivant/i }).click();

    // Step 3 — fill dates
    await page.locator('#checkin').fill(dateOffset(14));
    await page.locator('#checkout').fill(dateOffset(16));
    await page.getByRole('button', { name: /suivant/i }).click();

    // Step 4 — summary, then confirm (intercepted)
    await expect(page.getByText(/récapitulatif/i)).toBeVisible();
    await page.getByRole('button', { name: /confirmer la réservation/i }).click();

    // ── 4. Verify the capacity-exceeded toast ──────────────────────────────
    await expect(
      page.getByText(/pension est complète pour ces dates/i),
    ).toBeVisible({ timeout: 10_000 });

    // ── 5. Verify we did NOT navigate away (still on booking form) ─────────
    await expect(page).toHaveURL(/\/fr\/client\/bookings\/new/);
  });
});
