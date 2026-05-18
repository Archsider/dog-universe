/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub Next.js router — Modal calls router.refresh() on success.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Stub the autocomplete — we never click into Step 1's client picker
// in this test (we use anonymous mode).
vi.mock('../ClientSearchSelect', () => ({
  default: () => null,
}));

// Stub the dates helper — return a deterministic Casa date for default value.
vi.mock('@/lib/dates-casablanca', () => ({
  casablancaYMD: () => ({ year: 2026, month: 5, day: 16 }),
}));

// Stub formatMAD — keep the test orthogonal to localization.
vi.mock('@/lib/utils', () => ({
  formatMAD: (n: number) => `${n.toFixed(2)} MAD`,
}));

// Capture fetch calls so we can assert the POST happens (or doesn't) at the
// right moment of the flow.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, invoiceId: 'inv_test', invoiceNumber: 'DU-2026-9999' }),
  });
  globalThis.fetch = fetchMock as any;
  // happy-dom : crypto.randomUUID is available since v14, but make it
  // deterministic for test stability.
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => '11111111-2222-3333-4444-555555555555' },
    configurable: true,
  });
});
afterEach(() => cleanup());

async function importModal() {
  const mod = await import('../WalkinInvoiceModal');
  return mod.default;
}

// Helpers : drive the wizard to step 3 in anonymous mode with a single
// $100 PRODUCT item. Reused across tests.
async function openAndFillThroughStep3(user: ReturnType<typeof userEvent.setup>) {
  const Modal = await importModal();
  const utils = render(<Modal locale="fr" />);
  await user.click(utils.getByRole('button', { name: /Facture walk-in/ }));
  // Step 1 : switch to anonymous so step1Valid is true without picker.
  await user.click(utils.getByRole('button', { name: /Client anonyme/ }));
  await user.click(utils.getByRole('button', { name: /Suivant/ }));
  // Step 2 : fill the single default row + bump unitPrice > 0.
  // The default row now starts with category=OTHER (PRODUCT default was
  // changed in the catalog-intelligence refactor so the user makes a
  // deliberate PRODUCT pick via the smart-search input). The OTHER
  // placeholder is "Ex : Toilettage long".
  const desc = utils.container.querySelector('input[placeholder*="Toilettage"]') as HTMLInputElement;
  fireEvent.change(desc, { target: { value: 'Service divers' } });
  const unitPriceInput = utils.container.querySelectorAll('input[type="number"]')[1] as HTMLInputElement;
  fireEvent.change(unitPriceInput, { target: { value: '100' } });
  await user.click(utils.getByRole('button', { name: /Suivant/ }));
  return utils;
}

describe('WalkinInvoiceModal — confirm-before-submit (WIN 1)', () => {
  it('shows the recap when the operator clicks "Encaisser" the first time, without firing POST', async () => {
    const user = userEvent.setup();
    const utils = await openAndFillThroughStep3(user);

    // Step 3 is now visible — find the "Encaisser" button at the bottom.
    const cashInBtn = utils.getByRole('button', { name: /^Encaisser$/ });
    await user.click(cashInBtn);

    // Confirm step appears with the recap fields.
    expect(utils.queryByTestId('walkin-confirm-step')).toBeTruthy();
    expect(utils.queryByTestId('walkin-confirm-total')?.textContent).toContain('100');
    expect(utils.queryByTestId('walkin-confirm-method')?.textContent).toBe('Espèces');
    expect(utils.queryByTestId('walkin-confirm-client')?.textContent).toBe('Anonyme');

    // Critical : POST has NOT been called yet.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"Retour" from the recap returns to the editable Step 3 form', async () => {
    const user = userEvent.setup();
    const utils = await openAndFillThroughStep3(user);
    await user.click(utils.getByRole('button', { name: /^Encaisser$/ }));
    expect(utils.queryByTestId('walkin-confirm-step')).toBeTruthy();

    await user.click(utils.getByRole('button', { name: /Retour/ }));
    // Editable form back : the payment method buttons are visible again.
    expect(utils.queryByRole('button', { name: /Espèces/ })).toBeTruthy();
    expect(utils.queryByTestId('walkin-confirm-step')).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"Confirmer et encaisser" fires POST /api/admin/walkin-invoice with the right payload', async () => {
    const user = userEvent.setup();
    const utils = await openAndFillThroughStep3(user);
    await user.click(utils.getByRole('button', { name: /^Encaisser$/ }));
    const confirmBtn = utils.getByRole('button', { name: /Confirmer et encaisser/ });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/walkin-invoice');
    expect(opts.method).toBe('POST');
    // Header key is case-insensitive in HTTP. PR #168 typed client uses
    // the canonical 'Idempotency-Key' form ; older code used lowercase.
    const headers = opts.headers as Record<string, string>;
    expect(headers['Idempotency-Key'] || headers['idempotency-key']).toBeTruthy();
    const body = JSON.parse(opts.body as string);
    expect(body.paymentMethod).toBe('CASH');
    expect(body.clientId).toBeNull();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].unitPrice).toBe(100);
  });
});
