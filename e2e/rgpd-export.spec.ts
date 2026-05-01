/**
 * E2E — RGPD data export as CLIENT
 *
 * 1. Login as test client
 * 2. Navigate to /fr/client/profile (contains the RgpdSection component)
 * 3. Click "Télécharger mes données"
 * 4. Verify the download event fires with a non-empty JSON file
 */
import { test, expect } from '@playwright/test';
import { e2eSecretsAvailable, getClientCreds, loginAsClient } from './helpers/auth';

test.describe('RGPD — export données client', () => {
  test.beforeEach(() => {
    test.skip(!e2eSecretsAvailable(), 'Secrets TEST_* non configurés — skip e2e rgpd-export');
  });

  test('le bouton "Télécharger mes données" déclenche un téléchargement JSON non vide', async ({ page }) => {
    const creds = getClientCreds();

    // ── 1. Login ──────────────────────────────────────────────────────────
    await loginAsClient(page, creds);

    // ── 2. Navigate to profile ────────────────────────────────────────────
    await page.goto('/fr/client/profile');
    await expect(page).toHaveURL(/\/fr\/client\/profile/, { timeout: 15_000 });

    // The RgpdSection renders "Mes données personnelles" heading
    await expect(page.getByText(/mes données personnelles/i)).toBeVisible({ timeout: 10_000 });

    // ── 3. Click export button and capture the download ───────────────────
    // Playwright intercepts download events triggered by programmatic <a> clicks
    // (RgpdSection creates a blob URL anchor and calls .click() via JS)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: /télécharger mes données/i }).click(),
    ]);

    // ── 4. Verify the downloaded file is non-empty JSON ───────────────────
    expect(download).toBeTruthy();

    const filename = download.suggestedFilename();
    // Filename pattern: "doguniverse-export-{userId8}-YYYY-MM-DD.json"
    // or client-side fallback: "doguniverse-export-YYYY-MM-DD.json"
    expect(filename).toMatch(/doguniverse-export.*\.json/i);

    // Read the file stream to check it is non-empty
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const content = Buffer.concat(chunks).toString('utf-8');

    // Must be valid JSON with content
    expect(content.length).toBeGreaterThan(2); // at minimum "{}" or "[]"
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Le fichier téléchargé n'est pas du JSON valide. Contenu (100 chars): ${content.slice(0, 100)}`);
    }
    expect(parsed).toBeTruthy();
    // The export should contain at least a "user" key
    expect(parsed).toHaveProperty('user');
  });

  test('le bouton est visible dans la section RGPD du profil', async ({ page }) => {
    const creds = getClientCreds();

    await loginAsClient(page, creds);
    await page.goto('/fr/client/profile');

    // Verify both RGPD buttons are rendered
    await expect(page.getByRole('button', { name: /télécharger mes données/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /supprimer mon compte/i })).toBeVisible();
  });
});
