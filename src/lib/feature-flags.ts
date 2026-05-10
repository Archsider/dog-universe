// Feature flags — homemade, DB-backed, Redis-cached 60s.
//
// Évaluation (ordre, premier match gagne) :
//   1. `enabled = false`              → false (kill-switch global)
//   2. userId ∈ userWhitelist         → true  (bypass tout le reste)
//   3. role ∉ targetRoles (si défini) → false
//   4. rolloutPercent ≥ 100           → true
//   5. rolloutPercent ≤ 0             → false
//   6. hash(userId + key) % 100 < pct → sticky bucketing
//
// Fail-safe :
//   - Redis down  → lecture DB directe (latence dégradée, dispo OK)
//   - DB down     → return false (safe default — feature désactivée)
//   - Anonyme (pas de userId) : whitelist + role n/a, rollout = false
//                               sauf si rolloutPercent ≥ 100.

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { cacheGet, cacheSet, cacheDel } from '@/lib/cache';

export interface FeatureFlagRecord {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  targetRoles: string[];
  userWhitelist: string[];
}

export interface EvalContext {
  userId?: string | null;
  role?: string | null;
}

const CACHE_TTL_SECONDS = 60;

function cacheKey(key: string): string {
  return `ff:${key}`;
}

/**
 * Hash déterministe pour le sticky bucketing.
 * `userId + ':' + key` → SHA-256 → premiers 8 hex → uint32 → mod 100.
 * Garantit que le même utilisateur reste toujours dans le même bucket
 * pour le même flag (pas de flapping entre les requêtes).
 */
export function bucketFor(userId: string, key: string): number {
  const h = createHash('sha256').update(`${userId}:${key}`).digest('hex');
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100;
}

/** Lit un flag depuis le cache puis la DB. Cache `null` aussi (TTL court). */
export async function loadFlag(key: string): Promise<FeatureFlagRecord | null> {
  const ck = cacheKey(key);
  const hit = await cacheGet<FeatureFlagRecord | { __null: true }>(ck);
  if (hit && '__null' in hit) return null;
  if (hit) return hit as FeatureFlagRecord;

  let row: FeatureFlagRecord | null = null;
  try {
    const found = await prisma.featureFlag.findUnique({ where: { key } });
    if (found) {
      row = {
        key: found.key,
        description: found.description,
        enabled: found.enabled,
        rolloutPercent: found.rolloutPercent,
        targetRoles: found.targetRoles,
        userWhitelist: found.userWhitelist,
      };
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'feature-flags', message: 'DB load failed', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return null;
  }

  await cacheSet(ck, row ?? { __null: true }, CACHE_TTL_SECONDS);
  return row;
}

/** Évalue un flag chargé pour un contexte donné. Pure (testable seul). */
export function evaluateFlag(flag: FeatureFlagRecord | null, ctx: EvalContext): boolean {
  if (!flag) return false;
  if (!flag.enabled) return false;

  if (ctx.userId && flag.userWhitelist.includes(ctx.userId)) return true;

  if (flag.targetRoles.length > 0) {
    if (!ctx.role || !flag.targetRoles.includes(ctx.role)) return false;
  }

  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0)   return false;

  if (!ctx.userId) return false; // anonyme : pas de bucketing possible
  return bucketFor(ctx.userId, flag.key) < flag.rolloutPercent;
}

/** Helper principal — async, fail-safe (DB down → false). */
export async function isFeatureEnabled(key: string, ctx: EvalContext): Promise<boolean> {
  const flag = await loadFlag(key);
  return evaluateFlag(flag, ctx);
}

/** Évalue tous les flags pour un user (utilisé par /api/feature-flags/me). */
export async function getAllFlagsForUser(ctx: EvalContext): Promise<Record<string, boolean>> {
  let rows: FeatureFlagRecord[] = [];
  try {
    const found = await prisma.featureFlag.findMany({ take: 500 });
    rows = found.map((f) => ({
      key: f.key,
      description: f.description,
      enabled: f.enabled,
      rolloutPercent: f.rolloutPercent,
      targetRoles: f.targetRoles,
      userWhitelist: f.userWhitelist,
    }));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'feature-flags', message: 'getAllFlagsForUser DB failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const flag of rows) {
    out[flag.key] = evaluateFlag(flag, ctx);
  }
  return out;
}

/** Invalide le cache d'un flag — appeler après toute mutation. */
export async function invalidateFlagCache(key: string): Promise<void> {
  await cacheDel(cacheKey(key));
}
