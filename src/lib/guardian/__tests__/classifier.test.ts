import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock so vi.mock can reference it.
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockCreate } };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('classifier internals', () => {
  it('strips ```json fences', async () => {
    const { __internals } = await import('../classifier');
    expect(__internals.stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(__internals.stripFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('parseAndValidate rejects missing fields', async () => {
    const { __internals } = await import('../classifier');
    expect(__internals.parseAndValidate('{}')).toBeNull();
    expect(__internals.parseAndValidate('not json')).toBeNull();
    expect(
      __internals.parseAndValidate(
        '{"classification":"bug_code","severity":3,"suggestedAction":"silence","reason":"ok"}',
      ),
    ).toMatchObject({
      classification: 'bug_code',
      severity: 3,
      suggestedAction: 'silence',
    });
  });

  it('parseAndValidate rejects invalid classification', async () => {
    const { __internals } = await import('../classifier');
    expect(
      __internals.parseAndValidate(
        '{"classification":"weird","severity":3,"suggestedAction":"silence","reason":"ok"}',
      ),
    ).toBeNull();
  });

  it('parseAndValidate clamps severity into 1..5', async () => {
    const { __internals } = await import('../classifier');
    const r = __internals.parseAndValidate(
      '{"classification":"infra","severity":99,"suggestedAction":"notify_admin","reason":"down"}',
    );
    expect(r?.severity).toBe(5);
    const r2 = __internals.parseAndValidate(
      '{"classification":"transient","severity":-3,"suggestedAction":"silence","reason":"blip"}',
    );
    expect(r2?.severity).toBe(1);
  });
});

describe('classifyEvent (mocked Anthropic)', () => {
  it('returns unclassified when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Reset module to clear the cached singleton.
    vi.resetModules();
    const { classifyEvent } = await import('../classifier');
    const r = await classifyEvent({
      title: 'x',
      level: 'error',
      culprit: null,
      environment: 'prod',
      release: null,
      stackPreview: null,
      occurrencesLast24h: 0,
    });
    expect(r.classification).toBe('unclassified');
    expect(r.suggestedAction).toBe('unclassified');
  });

  it('parses a valid Claude response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.resetModules();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"classification":"bug_code","severity":4,"suggestedAction":"github_issue","reason":"NPE in route"}',
        },
      ],
    });
    const { classifyEvent } = await import('../classifier');
    const r = await classifyEvent({
      title: 'TypeError',
      level: 'error',
      culprit: 'api/foo',
      environment: 'production',
      release: 'v1',
      stackPreview: 'frame:1 fn',
      occurrencesLast24h: 5,
    });
    expect(r.classification).toBe('bug_code');
    expect(r.severity).toBe(4);
    expect(r.suggestedAction).toBe('github_issue');
  });

  it('falls back to unclassified on garbage Claude response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.resetModules();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I am a helpful assistant.' }],
    });
    const { classifyEvent } = await import('../classifier');
    const r = await classifyEvent({
      title: 'X',
      level: null,
      culprit: null,
      environment: null,
      release: null,
      stackPreview: null,
      occurrencesLast24h: 0,
    });
    expect(r.classification).toBe('unclassified');
  });

  it('falls back to unclassified when SDK throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.resetModules();
    mockCreate.mockRejectedValueOnce(new Error('network down'));
    const { classifyEvent } = await import('../classifier');
    const r = await classifyEvent({
      title: 'X',
      level: null,
      culprit: null,
      environment: null,
      release: null,
      stackPreview: null,
      occurrencesLast24h: 0,
    });
    expect(r.classification).toBe('unclassified');
    expect(r.reason).toContain('network down');
  });
});
