/**
 * Guardian classifier — Anthropic Claude triage of a sanitized Sentry event.
 *
 * Contract:
 *   - Input: sanitized event metadata (no PII, no full payload).
 *   - Output: a strict typed Classification — never throws.
 *   - Failure modes: missing API key, network error, malformed JSON, schema
 *     mismatch → returns the synthetic `unclassified` result. Callers must
 *     handle that path (notify admin, log).
 *
 * Model: claude-haiku-4-5-20251001 (fast + cheap, fits triage workload).
 * max_tokens kept low (1024) — output is a tiny JSON envelope, not prose.
 */

import Anthropic from '@anthropic-ai/sdk';

export type Classification =
  | 'transient'
  | 'bug_code'
  | 'data_corruption'
  | 'infra'
  | 'spam'
  | 'unclassified';

export type Action = 'github_issue' | 'notify_admin' | 'silence' | 'unclassified';

export interface ClassifierInput {
  title: string;
  level: string | null;
  culprit: string | null;
  environment: string | null;
  release: string | null;
  /** Top-of-stack frames (already sanitized, no PII). */
  stackPreview: string | null;
  /** Approximate occurrence count over the last 24h (DB derived). */
  occurrencesLast24h: number;
  /** Sanitized breadcrumbs / tags (already PII-stripped). */
  tags?: Record<string, unknown>;
}

export interface ClassifierResult {
  classification: Classification;
  /** 1 (informational) … 5 (page everyone). */
  severity: number;
  /** Suggested next step — does NOT execute it. The caller chooses. */
  suggestedAction: Action;
  /** Short human-readable reason (≤ 280 chars). */
  reason: string;
  /** Optional one-paragraph fix hint to include in a GitHub issue body. */
  suggestedFix?: string;
}

const SYSTEM_PROMPT = `You are the on-call triage assistant for a Next.js + Prisma + Supabase web app.
You receive sanitized Sentry events (no PII) and must classify them.

Categories:
- transient: network blip, timeout, retryable upstream (3rd-party API hiccup). Silence.
- bug_code: NPE, type errors, logic bugs in our code. Open a GitHub issue if recurrent (>3 in 24h).
- data_corruption: invariant broken in DB, foreign-key drift, missing required field. Notify admin.
- infra: DB unreachable, Redis down, Supabase 5xx, OOM. Notify admin.
- spam: noise / already-resolved / bot scan / impossible-to-fix from our side. Silence.

Severity scale (1..5):
1 = informational, ignore-friendly
2 = single user, recoverable
3 = recurrent or affecting one feature
4 = degraded service for many users
5 = full outage / data loss risk

Suggested actions: "github_issue" | "notify_admin" | "silence".
Heuristics:
- bug_code with occurrencesLast24h > 3 → "github_issue"
- bug_code with ≤ 3 occurrences → "silence" (wait for pattern)
- infra OR data_corruption → "notify_admin"
- transient OR spam → "silence"

You MUST reply with a single JSON object, no markdown fences, no prose:
{"classification":"...","severity":1-5,"suggestedAction":"...","reason":"≤280 chars","suggestedFix":"optional ≤500 chars"}`;

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/** Synthetic fallback when classification cannot run. */
export function unclassifiedResult(reason: string): ClassifierResult {
  return {
    classification: 'unclassified',
    severity: 3,
    suggestedAction: 'unclassified',
    reason: reason.slice(0, 280),
  };
}

const VALID_CLASSIFICATIONS: Classification[] = [
  'transient',
  'bug_code',
  'data_corruption',
  'infra',
  'spam',
  'unclassified',
];
const VALID_ACTIONS: Action[] = ['github_issue', 'notify_admin', 'silence', 'unclassified'];

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseAndValidate(text: string): ClassifierResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const cls = o.classification;
  const sev = o.severity;
  const act = o.suggestedAction;
  const reason = o.reason;
  if (typeof cls !== 'string' || !VALID_CLASSIFICATIONS.includes(cls as Classification)) return null;
  if (typeof sev !== 'number' || !Number.isFinite(sev)) return null;
  const sevInt = Math.max(1, Math.min(5, Math.round(sev)));
  if (typeof act !== 'string' || !VALID_ACTIONS.includes(act as Action)) return null;
  if (typeof reason !== 'string' || reason.length === 0) return null;
  const fix = typeof o.suggestedFix === 'string' ? o.suggestedFix.slice(0, 500) : undefined;
  return {
    classification: cls as Classification,
    severity: sevInt,
    suggestedAction: act as Action,
    reason: reason.slice(0, 280),
    suggestedFix: fix,
  };
}

/**
 * Classify a sanitized event. Never throws.
 */
export async function classifyEvent(input: ClassifierInput): Promise<ClassifierResult> {
  const client = getClient();
  if (!client) return unclassifiedResult('ANTHROPIC_API_KEY missing — manual triage required');

  const userPayload = JSON.stringify(input).slice(0, 8000); // hard cap on prompt size

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPayload }],
    });
    const block = message.content[0];
    if (!block || block.type !== 'text') {
      return unclassifiedResult('Anthropic returned non-text response');
    }
    const validated = parseAndValidate(block.text);
    if (!validated) {
      return unclassifiedResult('Anthropic response failed schema validation');
    }
    return validated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return unclassifiedResult(`Anthropic call failed: ${msg.slice(0, 200)}`);
  }
}

// Exported for tests.
export const __internals = { parseAndValidate, stripFences, SYSTEM_PROMPT };
