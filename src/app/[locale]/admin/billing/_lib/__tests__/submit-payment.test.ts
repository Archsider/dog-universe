import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitPayment } from '../submit-payment';

// Helper to capture the fetch call. The unified payment submitter is the
// ONLY way the frontend records a payment now, so its on-the-wire contract
// matters: URL shape, headers, body shape, error mapping. Each test pins
// one slice of that contract so a regression here surfaces immediately.

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastFetchCall(): { url: string; init: RequestInit } {
  const fetchMock = global.fetch as unknown as { mock: { calls: [string, RequestInit][] } };
  const [url, init] = fetchMock.mock.calls[0];
  return { url, init };
}

describe('submitPayment', () => {
  it('POSTs to /api/invoices/[id]/payments with the canonical body shape', async () => {
    (global.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    const result = await submitPayment({
      invoiceId: 'inv-1',
      amount: 1500,
      paymentMethod: 'CASH',
      paymentDate: '2026-05-14',
      notes: null,
      sendClientSms: true,
    });

    expect(result).toEqual({ ok: true, status: 201 });

    const { url, init } = lastFetchCall();
    expect(url).toBe('/api/invoices/inv-1/payments');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toMatch(/.+/); // any non-empty key
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      amount: 1500,
      paymentMethod: 'CASH',
      paymentDate: '2026-05-14',
      notes: null,
      sendClientSms: true,
    });
  });

  it('includes a fresh Idempotency-Key on every call (no key reuse)', async () => {
    const fetchMock = global.fetch as unknown as {
      mockResolvedValue: (v: unknown) => void;
      mock: { calls: [string, RequestInit][] };
    };
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

    await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
    });
    await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
    });
    const key1 = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['Idempotency-Key'];
    const key2 = (fetchMock.mock.calls[1][1].headers as Record<string, string>)['Idempotency-Key'];
    expect(key1).not.toBe(key2);
  });

  it('forwards sendClientSms=false so the server skips the client notification', async () => {
    (global.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });
    await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: false,
    });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.sendClientSms).toBe(false);
  });

  it('maps a non-2xx JSON error response to ok:false with error code', async () => {
    (global.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'DUPLICATE_REQUEST' }),
    });
    const result = await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
    });
    expect(result).toEqual({ ok: false, status: 409, error: 'DUPLICATE_REQUEST' });
  });

  it('falls back to "HTTP {status}" when the error body is not JSON', async () => {
    (global.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const result = await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(500);
    expect(result.error).toBe('HTTP 500');
  });

  it('maps a network failure to ok:false / status 0', async () => {
    (global.fetch as unknown as { mockRejectedValueOnce: (v: unknown) => void }).mockRejectedValueOnce(
      new Error('fetch failed'),
    );
    const result = await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(0);
    expect(result.error).toBe('fetch failed');
  });

  it('serialises notes:null when omitted', async () => {
    (global.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });
    await submitPayment({
      invoiceId: 'inv-1', amount: 100, paymentMethod: 'CASH',
      paymentDate: '2026-05-14', sendClientSms: true,
      // notes omitted
    });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.notes).toBeNull();
  });
});
