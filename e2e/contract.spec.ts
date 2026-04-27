import { test, expect } from '@playwright/test';
import { getAdminCreds, getClientCreds, resetClientContract } from './helpers/auth';

// Test de non-régression critique : signature de contrat de pension.
// Cas réel : Rita a été bloquée 3h en prod après un upgrade Next.js qui a cassé
// la génération PDF côté API. Ce test vérifie que tout le flux fonctionne :
// modal → canvas signature_pad → checkbox → POST /api/contracts/sign → modal fermé.

test.describe('Contract signing — happy path', () => {
  test.beforeEach(async ({ request, baseURL }) => {
    // Reset du contrat avant chaque run pour rendre le test idempotent
    expect(baseURL).toBeTruthy();
    await resetClientContract(
      request,
      baseURL!,
      getAdminCreds(),
      getClientCreds().email,
    );
  });

  test('un client sans contrat peut signer et accéder au dashboard', async ({ page }) => {
    const creds = getClientCreds();

    // Login
    await page.goto('/fr/auth/login');
    await page.locator('#email').fill(creds.email);
    await page.locator('#password').fill(creds.password);
    await page.getByRole('button', { name: /se connecter/i }).click();

    await page.waitForURL(/\/fr\/client\/dashboard/, { timeout: 15_000 });

    // ── Modal contrat affichée ──────────────────────────────────────────
    const modalHeading = page.getByRole('heading', {
      name: /contrat de pension — DOG UNIVERSE/i,
    });
    await expect(modalHeading).toBeVisible({ timeout: 10_000 });

    // ── Dessine une signature diagonale réaliste sur le canvas ──────────
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Impossible de localiser le canvas de signature');

    // signature_pad écoute pointerdown/move/up. On trace une sinusoïde courte
    // pour produire un trait reconnu (un simple click ne déclenche pas endStroke).
    const startX = box.x + box.width * 0.15;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.85;
    const endY = box.y + box.height * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      // wobble vertical pour donner du relief au tracé
      const y = startY + Math.sin(t * Math.PI * 2) * (box.height * 0.2);
      await page.mouse.move(x, y, { steps: 4 });
    }
    await page.mouse.move(endX, endY, { steps: 4 });
    await page.mouse.up();

    // ── Coche la checkbox de confirmation ───────────────────────────────
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // ── Soumet et attend la réponse API ─────────────────────────────────
    const signButton = page.getByRole('button', {
      name: /signer le contrat et accéder à mon espace/i,
    });
    await expect(signButton).toBeEnabled();

    const [signResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/contracts/sign') && r.request().method() === 'POST',
        { timeout: 20_000 },
      ),
      signButton.click(),
    ]);

    // Sanity check sur la réponse — message d'erreur explicite si PDF_GENERATION_FAILED
    if (!signResponse.ok()) {
      const body = await signResponse.text().catch(() => '');
      throw new Error(
        `POST /api/contracts/sign a échoué (${signResponse.status()}). ` +
        `Si tu vois "PDF_GENERATION_FAILED", c'est le bug Rita — vérifier ` +
        `outputFileTracingIncludes dans next.config.mjs. Body: ${body}`,
      );
    }

    // ── Aucune erreur visible dans la modal ─────────────────────────────
    await expect(page.getByText(/PDF_GENERATION_FAILED/i)).not.toBeVisible();
    await expect(page.getByText(/erreur lors de la signature/i)).not.toBeVisible();

    // ── Écran de succès puis modal fermée ───────────────────────────────
    await expect(page.getByText(/contrat signé avec succès/i)).toBeVisible({ timeout: 5_000 });
    // Le ContractGate démasque les enfants après ~1500ms — on attend que la heading disparaisse
    await expect(modalHeading).toBeHidden({ timeout: 10_000 });

    // ── Toujours sur le dashboard, pas de redirect vers login ───────────
    await expect(page).toHaveURL(/\/fr\/client\/dashboard/);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
