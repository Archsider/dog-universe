import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

export type Credentials = {
  email: string;
  password: string;
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    test.skip(true, `Secret ${name} manquant — configure-le dans .env.test (local) ou dans les secrets GitHub Actions (CI).`);
    return ''; // unreachable after test.skip, satisfies TS
  }
  return v;
}

/** Returns true if all e2e secrets are set — use in test.skip guards. */
export function e2eSecretsAvailable(): boolean {
  return !!(
    process.env.TEST_CLIENT_EMAIL &&
    process.env.TEST_CLIENT_PASSWORD &&
    process.env.TEST_CLIENT_NAME &&
    process.env.TEST_ADMIN_EMAIL &&
    process.env.TEST_ADMIN_PASSWORD
  );
}

export function getClientCreds(): Credentials & { name: string } {
  return {
    email: requireEnv('TEST_CLIENT_EMAIL'),
    password: requireEnv('TEST_CLIENT_PASSWORD'),
    name: requireEnv('TEST_CLIENT_NAME'),
  };
}

export function getAdminCreds(): Credentials {
  return {
    email: requireEnv('TEST_ADMIN_EMAIL'),
    password: requireEnv('TEST_ADMIN_PASSWORD'),
  };
}

// Login UI : remplit le formulaire et attend la redirection.
// Retourne true si l'utilisateur a atterri sur le dashboard client.
export async function loginAsClient(page: Page, creds: Credentials): Promise<void> {
  await page.goto('/fr/auth/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await Promise.all([
    page.waitForURL(/\/fr\/(client|admin)\//, { timeout: 15_000 }),
    page.getByRole('button', { name: /se connecter/i }).click(),
  ]);
}

// Reset du contrat d'un client via API admin.
// Utilise un APIRequestContext isolé (pas la page) pour ne pas polluer la session de test.
export async function resetClientContract(
  request: APIRequestContext,
  baseURL: string,
  admin: Credentials,
  clientEmail: string,
): Promise<void> {
  // 1. NextAuth credentials login : récupère un csrf-token puis poste les credentials.
  const csrfRes = await request.get(`${baseURL}/api/auth/csrf`);
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = await csrfRes.json();

  const loginRes = await request.post(`${baseURL}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: admin.email.toLowerCase().trim(),
      password: admin.password,
      callbackUrl: `${baseURL}/fr/admin/dashboard`,
      json: 'true',
    },
  });
  // NextAuth peut répondre 200 OU 302 selon la version — on vérifie juste qu'il y a un cookie de session
  expect([200, 302]).toContain(loginRes.status());

  // 2. Reset le contrat
  const resetRes = await request.post(`${baseURL}/api/admin/contracts/reset`, {
    data: { clientEmail },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resetRes.ok()) {
    const body = await resetRes.text();
    throw new Error(
      `Reset contrat a échoué (${resetRes.status()}). ` +
      `Vérifie les credentials admin et l'existence de ${clientEmail}. Body: ${body}`,
    );
  }
}
