/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (must be declared before importing the route) ──────────
const authMock = vi.fn();
vi.mock('../../../../../../auth', () => ({ auth: () => authMock() }));

const isFeatureEnabledMock = vi.fn();
vi.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: (...a: any[]) => isFeatureEnabledMock(...a),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Anthropic SDK — we don't actually exercise streaming in tests ; we
// validate the request handshake (auth, flag, body shape, key absence).
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      stream: vi.fn(() => ({
        on: vi.fn(),
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'mock response' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      })),
    };
  }
  return { default: MockAnthropic };
});

async function callPost(body: unknown, opts: { role?: string } = {}) {
  authMock.mockReset();
  if (opts.role !== undefined) {
    authMock.mockResolvedValueOnce({ user: { id: 'u_1', role: opts.role } });
  } else {
    authMock.mockResolvedValueOnce(null);
  }
  const req = new Request('http://test/api/concierge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Reset module cache so the lazy Anthropic singleton picks up the
  // current process.env.ANTHROPIC_API_KEY (some tests intentionally
  // delete the env var to verify fail-closed behavior).
  vi.resetModules();
  const mod = await import('../route');
  const res = await mod.POST(req as any);
  return res;
}

describe('POST /api/concierge/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabledMock.mockResolvedValue(true);
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
  });

  it('401 without session', async () => {
    const res = await callPost({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });

  it('403 when role is not CLIENT', async () => {
    const res = await callPost(
      { messages: [{ role: 'user', content: 'hi' }] },
      { role: 'ADMIN' },
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error).toBe('CLIENT_ONLY');
  });

  it('403 FEATURE_DISABLED when concierge-chat flag is off', async () => {
    isFeatureEnabledMock.mockResolvedValueOnce(false);
    const res = await callPost(
      { messages: [{ role: 'user', content: 'hi' }] },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error).toBe('FEATURE_DISABLED');
  });

  it('503 SERVICE_UNAVAILABLE when ANTHROPIC_API_KEY missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Re-import the route module so it picks up the missing key state.
    vi.resetModules();
    const res = await callPost(
      { messages: [{ role: 'user', content: 'hi' }] },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(503);
  });

  it('400 INVALID_BODY on malformed messages array', async () => {
    const res = await callPost(
      { messages: [] },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_BODY when content exceeds 2000 chars', async () => {
    const res = await callPost(
      { messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_MESSAGE_ORDER when first message is assistant', async () => {
    const res = await callPost(
      {
        messages: [
          { role: 'assistant', content: 'hi' },
          { role: 'user', content: 'hello' },
        ],
      },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe('INVALID_MESSAGE_ORDER');
  });

  it('400 INVALID_MESSAGE_ORDER when last message is assistant', async () => {
    const res = await callPost(
      {
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(400);
  });

  it('happy path returns SSE stream', async () => {
    const res = await callPost(
      { messages: [{ role: 'user', content: 'Bonjour' }] },
      { role: 'CLIENT' },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
