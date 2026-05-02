// Centralised environment variable validation (Zod).
//
// Strategy:
//  - Hard-required at runtime: only the variables the app cannot boot without
//    (DB connection + NextAuth secrets). Everything else is `.optional()`
//    because consuming libs (Redis, Supabase, Anthropic) already fail-open
//    when their env is missing — we don't want to brick local/dev/test.
//  - Skip-throw mode: during tests, builds, or when SKIP_ENV_VALIDATION=1,
//    we log warnings instead of throwing so `tsc --noEmit`, `next build`
//    and CI never break for missing secrets.
//  - Production (NODE_ENV=production at boot) throws loudly with the list
//    of missing/invalid keys.
import { z } from 'zod';

const envSchema = z.object({
  // ── Hard-required (boot-blocking) ─────────────────────────────────────
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),

  // ── Optional (libs already fail-open / feature-flag on absence) ───────
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_HOST: z.string().min(1).optional(),
  UPSTASH_REDIS_PORT: z.coerce.number().int().positive().optional(),
  UPSTASH_REDIS_PASSWORD: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('uploads'),
  SUPABASE_PRIVATE_STORAGE_BUCKET: z.string().default('uploads-private'),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  SENTRY_DSN: z.string().url().optional(),
  // CRON_SECRET: required in production (cron endpoints would be unprotected without it).
  // Optional in dev/test/build to keep local DX painless.
  CRON_SECRET:
    process.env.NODE_ENV === 'production'
      ? z.string().min(32, 'CRON_SECRET must be ≥32 chars in production')
      : z.string().optional(),
});

const skip =
  process.env.SKIP_ENV_VALIDATION === '1' ||
  process.env.NODE_ENV === 'test' ||
  // `next build` runs static analysis where some secrets are absent.
  // NEXT_PHASE is set to 'phase-production-build' during `next build`.
  process.env.NEXT_PHASE === 'phase-production-build';

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  if (skip) {
    console.warn(`[env] validation skipped (test/build):\n${issues}`);
  } else {
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
}

export const env = (parsed.success
  ? parsed.data
  : (process.env as unknown)) as z.infer<typeof envSchema>;
