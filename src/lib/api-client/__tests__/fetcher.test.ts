import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiPost } from '../fetcher';

const testSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD']),
}).strict();

describe('apiPost', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects pre-flight when client validation fails', async () => {
    const result = await apiPost('/api/test', testSchema, {
      amount: -5,
      method: 'CASH',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CLIENT_VALIDATION_FAILED');
      expect(result.error.issues).toBeDefined();
      expect(result.error.issues!.length).toBeGreaterThan(0);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects pre-flight on extra fields (strict mode)', async () => {
    const result = await apiPost('/api/test', testSchema, {
      amount: 100,
      method: 'CASH',
      sneaky: 'extra',
    });
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns ok=true on 2xx with JSON body', async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'abc' }), { status: 201 }),
    );
    const result = await apiPost<typeof testSchema, { ok: true; id: string }>(
      '/api/test',
      testSchema,
      { amount: 100, method: 'CASH' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('abc');
      expect(result.status).toBe(201);
    }
  });

  it('returns ok=false with code from server JSON on 4xx', async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: 'OVERPAYMENT', detail: { balance: -50 } }), {
        status: 400,
      }),
    );
    const result = await apiPost('/api/test', testSchema, {
      amount: 100,
      method: 'CASH',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('OVERPAYMENT');
      expect(result.status).toBe(400);
      expect(result.error.detail).toEqual({ balance: -50 });
    }
  });

  it('passes Idempotency-Key header through', async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await apiPost('/api/test', testSchema, { amount: 1, method: 'CASH' }, {
      headers: { 'Idempotency-Key': 'abc123' },
    });
    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers['Idempotency-Key']).toBe('abc123');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('returns NETWORK_ERROR on fetch throw', async () => {
    (global.fetch as any).mockRejectedValue(new Error('connection refused'));
    const result = await apiPost('/api/test', testSchema, {
      amount: 1,
      method: 'CASH',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('connection refused');
    }
  });

  it('handles non-JSON 4xx responses gracefully', async () => {
    (global.fetch as any).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const result = await apiPost('/api/test', testSchema, {
      amount: 1,
      method: 'CASH',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_ERROR');
      expect(result.status).toBe(500);
    }
  });

  it('forwards Zod issues from server INVALID_BODY response', async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'INVALID_BODY',
          issues: [{ path: ['amount'], message: 'too small' }],
        }),
        { status: 400 },
      ),
    );
    const result = await apiPost('/api/test', testSchema, {
      amount: 1,
      method: 'CASH',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_BODY');
      expect(result.error.issues).toEqual([{ path: ['amount'], message: 'too small' }]);
    }
  });
});
