import { logger } from '@/lib/logger';
type RequiredVar = {
  name: string;
  minLength?: number;
  exactLength?: number;
};

// Vars whose absence/invalidity must HARD-FAIL the boot in production.
// These either guarantee security (TOTP_ENCRYPTION_KEY, NEXTAUTH_SECRET,
// CRON_SECRET) or are required for core data flow (DB, Storage, Redis REST).
const REQUIRED_VARS: RequiredVar[] = [
  { name: 'TOTP_ENCRYPTION_KEY', exactLength: 64 },
  { name: 'CRON_SECRET', minLength: 16 },
  { name: 'NEXTAUTH_SECRET', minLength: 16 },
  { name: 'DATABASE_URL', minLength: 10 },
  { name: 'DIRECT_URL', minLength: 10 },
  { name: 'SUPABASE_URL', minLength: 10 },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', minLength: 10 },
  { name: 'UPSTASH_REDIS_REST_URL', minLength: 10 },
  { name: 'UPSTASH_REDIS_REST_TOKEN', minLength: 10 },
];

// Vars whose absence silently DEGRADES a feature without breaking the app
// (BullMQ → direct fallback, Sentry → no error reporting, Guardian → no
// auto-issues, Anthropic → manual vaccination entry). We refuse to hard-fail
// because some deployments may legitimately disable these features, but we
// emit a structured warning so the operator knows the feature is off.
const OPTIONAL_VARS: RequiredVar[] = [
  { name: 'UPSTASH_REDIS_HOST', minLength: 5 },     // BullMQ TCP
  { name: 'UPSTASH_REDIS_PASSWORD', minLength: 5 }, // BullMQ TCP
  { name: 'SENTRY_DSN', minLength: 10 },
  { name: 'SENTRY_WEBHOOK_SECRET', minLength: 10 }, // AI Guardian webhook
  { name: 'ANTHROPIC_API_KEY', minLength: 10 },     // Vaccination AI + Guardian classify
  { name: 'GITHUB_TOKEN', minLength: 10 },          // Guardian auto-issue
  { name: 'GUARDIAN_GITHUB_REPO', minLength: 5 },   // Guardian target repo
];

function validate(v: RequiredVar): string | null {
  const raw = process.env[v.name];
  if (!raw || raw.trim() === '') return `missing ${v.name}`;
  if (v.exactLength && raw.length !== v.exactLength) {
    return `${v.name} must be exactly ${v.exactLength} chars (got ${raw.length})`;
  }
  if (v.minLength && raw.length < v.minLength) {
    return `${v.name} must be at least ${v.minLength} chars (got ${raw.length})`;
  }
  return null;
}

export function assertProductionEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of REQUIRED_VARS) {
    const err = validate(v);
    if (err) errors.push(err);
  }

  for (const v of OPTIONAL_VARS) {
    const err = validate(v);
    if (err) warnings.push(err);
  }

  // TLS / HTTPS guards — required in prod. Refusing http:// for NEXTAUTH_URL
  // prevents cookie leakage on the session callback; warning on a DATABASE_URL
  // without sslmode=require flags an unencrypted Postgres link.
  if (isProd) {
    const nextauthUrl = process.env.NEXTAUTH_URL;
    if (nextauthUrl && !nextauthUrl.startsWith('https://')) {
      errors.push('NEXTAUTH_URL must be https:// in production');
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (
      databaseUrl &&
      !databaseUrl.includes('sslmode=require') &&
      !databaseUrl.includes('?sslmode=')
    ) {
      warnings.push('DATABASE_URL should include sslmode=require');
    }
    // PgBouncer drift guard — the prod stack runs through the Supabase
    // Transaction Pooler (verified 2026-05-13: port 6543 + pgbouncer=true).
    // This warning catches accidental regressions if someone later swaps
    // DATABASE_URL back to the direct connection — the app keeps working
    // but scale silently caps at ~500 connections. Read-only signal.
    const directUrl = process.env.DIRECT_URL;
    if (databaseUrl && databaseUrl !== directUrl) {
      const looksPooled = databaseUrl.includes(':6543') || databaseUrl.includes('pgbouncer=true');
      if (!looksPooled) {
        warnings.push(
          'DATABASE_URL drift: pool not detected (expected :6543 or pgbouncer=true). ' +
            'See docs/PGBOUNCER.md.',
        );
      }
    } else if (databaseUrl && !directUrl) {
      warnings.push(
        'DIRECT_URL is unset — Prisma migrations would run through the pool ' +
          '(slow / unsafe).',
      );
    }
  }

  if (warnings.length > 0) {
    logger.warn('boot', 'optional env vars missing — feature degraded', { warnings });
  }

  if (errors.length === 0) return;

  if (isProd) {
    throw new Error(`BOOT_CHECK_FAILED: ${errors.join('; ')}`);
  }

  logger.warn('boot', 'boot-check missing env vars (dev mode — non-blocking)', { errors });
}
