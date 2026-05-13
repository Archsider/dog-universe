import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { withSchema } from '../with-schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('withSchema — body validation', () => {
  const bodySchema = z.object({ name: z.string().min(1), age: z.number().int().positive() });

  it('passes a valid body to the handler', async () => {
    const handler = vi.fn(async (_req: Request, ctx: { body: { name: string; age: number } }) => {
      return new Response(JSON.stringify({ echo: ctx.body }));
    });
    const route = withSchema({ body: bodySchema }, handler);
    const res = await route(makeRequest({ name: 'Max', age: 5 }), { params: Promise.resolve({}) });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: { name: 'Max', age: 5 } });
  });

  it('returns 400 INVALID_JSON when the body is not valid JSON', async () => {
    const handler = vi.fn();
    const route = withSchema({ body: bodySchema }, handler);
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: '{not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await route(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_JSON' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when the body is malformed', async () => {
    const handler = vi.fn();
    const route = withSchema({ body: bodySchema }, handler);
    const res = await route(makeRequest({ name: '', age: -1 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('exposes Zod issues only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const route = withSchema({ body: bodySchema }, async () => new Response('ok'));
    const res = await route(makeRequest({ name: '', age: -1 }), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('hides Zod issues in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const route = withSchema({ body: bodySchema }, async () => new Response('ok'));
    const res = await route(makeRequest({ name: '' }), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toBeUndefined();
  });
});

describe('withSchema — params validation', () => {
  const paramsSchema = z.object({ id: z.string().min(8) });

  it('passes valid params to the handler', async () => {
    const handler = vi.fn(async (_req: Request, ctx: { params: { id: string } }) => {
      return new Response(JSON.stringify({ id: ctx.params.id }));
    });
    const route = withSchema({ params: paramsSchema }, handler);
    const res = await route(makeRequest(), { params: Promise.resolve({ id: 'abc12345' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'abc12345' });
  });

  it('returns 400 VALIDATION_ERROR when params fail validation', async () => {
    const handler = vi.fn();
    const route = withSchema({ params: paramsSchema }, handler);
    const res = await route(makeRequest(), { params: Promise.resolve({ id: 'short' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withSchema — combined body + params', () => {
  it('rejects on params before reading the body (fail fast)', async () => {
    const bodyParseSpy = vi.fn();
    class TrackingRequest extends Request {
      override async json() {
        bodyParseSpy();
        return super.json();
      }
    }
    const route = withSchema(
      {
        body: z.object({ x: z.number() }),
        params: z.object({ id: z.string().min(5) }),
      },
      async () => new Response('ok'),
    );
    const req = new TrackingRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await route(req, { params: Promise.resolve({ id: 'no' }) });
    expect(res.status).toBe(400);
    // Body parsing should not have been triggered when params already failed.
    expect(bodyParseSpy).not.toHaveBeenCalled();
  });

  it('handles routes with no schemas at all (pass-through)', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const route = withSchema({}, handler);
    const res = await route(makeRequest(), { params: Promise.resolve({}) });
    expect(handler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
