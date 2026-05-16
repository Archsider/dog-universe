import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Save/restore env state — multiple tests mutate process.env.
let savedEnv: Record<string, string | undefined>;
const TRACKED_KEYS = [
  'NODE_ENV',
  'TOTP_ENCRYPTION_KEY',
  'CRON_SECRET',
  'NEXTAUTH_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'AI_GUARDIAN_ENABLED',
  'SENTRY_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GUARDIAN_GITHUB_REPO',
];

function setRequiredVars() {
  process.env.TOTP_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.CRON_SECRET = 'cron-secret-min-16';
  process.env.NEXTAUTH_SECRET = 'nextauth-secret-min-16';
  process.env.DATABASE_URL = 'postgres://localhost:6543/db?pgbouncer=true&sslmode=require';
  process.env.DIRECT_URL = 'postgres://localhost:5432/db?sslmode=require';
  process.env.NEXTAUTH_URL = 'https://example.com';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.upstash';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash_token_min10';
}

beforeEach(() => {
  savedEnv = {};
  for (const k of TRACKED_KEYS) savedEnv[k] = process.env[k];
  for (const k of TRACKED_KEYS) delete process.env[k];
  delete process.env.NEXTAUTH_URL;
  setRequiredVars();
});

afterEach(() => {
  for (const k of TRACKED_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function freshAssertProductionEnv() {
  // Re-import to dodge module-level caching if any.
  const mod = await import('../boot-checks');
  return mod.assertProductionEnv;
}

describe('assertProductionEnv — AI Guardian gating (WIN 5)', () => {
  it('Guardian off + no Guardian vars : passes (warnings only)', async () => {
    delete process.env.AI_GUARDIAN_ENABLED;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).not.toThrow();
  });

  it('Guardian off + Guardian vars present : passes (no warnings)', async () => {
    delete process.env.AI_GUARDIAN_ENABLED;
    process.env.SENTRY_WEBHOOK_SECRET = 'webhook-secret-xyz';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
    process.env.GITHUB_TOKEN = 'ghp_test_token_xyz';
    process.env.GUARDIAN_GITHUB_REPO = 'Archsider/dog-universe';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).not.toThrow();
  });

  it('Guardian ON + all Guardian vars present : passes', async () => {
    process.env.AI_GUARDIAN_ENABLED = 'true';
    process.env.SENTRY_WEBHOOK_SECRET = 'webhook-secret-xyz';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
    process.env.GITHUB_TOKEN = 'ghp_test_token_xyz';
    process.env.GUARDIAN_GITHUB_REPO = 'Archsider/dog-universe';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).not.toThrow();
  });

  it('Guardian ON + missing ANTHROPIC_API_KEY in prod : THROWS', async () => {
    process.env.AI_GUARDIAN_ENABLED = '1';
    process.env.SENTRY_WEBHOOK_SECRET = 'webhook-secret-xyz';
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GITHUB_TOKEN = 'ghp_test_token_xyz';
    process.env.GUARDIAN_GITHUB_REPO = 'Archsider/dog-universe';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).toThrow(/AI_GUARDIAN_ENABLED.*ANTHROPIC_API_KEY/);
  });

  it('Guardian ON + missing GITHUB_TOKEN in prod : THROWS', async () => {
    process.env.AI_GUARDIAN_ENABLED = 'true';
    process.env.SENTRY_WEBHOOK_SECRET = 'webhook-secret-xyz';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
    delete process.env.GITHUB_TOKEN;
    process.env.GUARDIAN_GITHUB_REPO = 'Archsider/dog-universe';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).toThrow(/AI_GUARDIAN_ENABLED.*GITHUB_TOKEN/);
  });

  it('Guardian ON + missing webhook secret in dev : does NOT throw (dev mode non-blocking)', async () => {
    process.env.AI_GUARDIAN_ENABLED = 'true';
    delete process.env.SENTRY_WEBHOOK_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fn = await freshAssertProductionEnv();
    expect(() => fn()).not.toThrow();
  });

  it('AI_GUARDIAN_ENABLED accepts "1", "true", "TRUE" (case-insensitive)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.ANTHROPIC_API_KEY;

    for (const v of ['1', 'true', 'TRUE', 'True']) {
      process.env.AI_GUARDIAN_ENABLED = v;
      const fn = await freshAssertProductionEnv();
      expect(() => fn()).toThrow();
    }
    // Anything else = disabled.
    for (const v of ['0', 'false', 'no', '']) {
      process.env.AI_GUARDIAN_ENABLED = v;
      const fn = await freshAssertProductionEnv();
      expect(() => fn()).not.toThrow();
    }
  });
});
