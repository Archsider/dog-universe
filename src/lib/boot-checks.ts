type RequiredVar = {
  name: string;
  minLength?: number;
  exactLength?: number;
};

const REQUIRED_VARS: RequiredVar[] = [
  { name: 'TOTP_ENCRYPTION_KEY', exactLength: 64 },
  { name: 'CRON_SECRET', minLength: 16 },
  { name: 'NEXTAUTH_SECRET', minLength: 16 },
  { name: 'DATABASE_URL', minLength: 10 },
  { name: 'SUPABASE_URL', minLength: 10 },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', minLength: 10 },
  { name: 'UPSTASH_REDIS_REST_URL', minLength: 10 },
  { name: 'UPSTASH_REDIS_REST_TOKEN', minLength: 10 },
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

  for (const v of REQUIRED_VARS) {
    const err = validate(v);
    if (err) errors.push(err);
  }

  if (errors.length === 0) return;

  if (isProd) {
    throw new Error(`BOOT_CHECK_FAILED: ${errors.join('; ')}`);
  }

  console.warn(
    JSON.stringify({
      level: 'warn',
      service: 'boot',
      message: 'boot-check missing env vars (dev mode — non-blocking)',
      errors,
      timestamp: new Date().toISOString(),
    }),
  );
}
