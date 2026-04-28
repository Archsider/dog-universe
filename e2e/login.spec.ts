import { test, expect } from '@playwright/test';
import { e2eSecretsAvailable, getClientCreds, loginAsClient } from './helpers/auth';

test.describe('Login — happy path', () => {
  test.beforeEach(() => {
    test.skip(!e2eSecretsAvailable(), 'Secrets TEST_CLIENT_* non configurés — skip e2e login');
  });

  test('se connecter en tant que CLIENT redirige vers le dashboard', async ({ page }) => {
    const creds = getClientCreds();

    await page.goto('/fr/auth/login');

    // Sanity : le titre du form est bien chargé (i18n FR)
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible();

    await page.locator('#email').fill(creds.email);
    await page.locator('#password').fill(creds.password);
    await page.getByRole('button', { name: /se connecter/i }).click();

    // Le client est redirigé vers /fr/client/dashboard.
    // La modale de contrat peut overlay le dashboard (route inchangée), c'est ok.
    await page.waitForURL(/\/fr\/client\/dashboard/, { timeout: 15_000 });

    // Pas d'erreur "Email ou mot de passe incorrect" affichée
    await expect(page.getByText(/email ou mot de passe incorrect/i)).not.toBeVisible();
  });

  test('se connecter via le helper partagé', async ({ page }) => {
    await loginAsClient(page, getClientCreds());
    await expect(page).toHaveURL(/\/fr\/(client|admin)\//);
  });
});
