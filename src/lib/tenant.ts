/**
 * Multi-tenant scaffolding (NON destructif).
 *
 * Aujourd'hui Dog Universe est single-tenant ('default'). Ce module pose
 * l'API que les call sites futurs utiliseront, sans changer le runtime :
 *
 *   - `getCurrentTenantId()` retourne `process.env.DEFAULT_TENANT_ID ?? 'default'`
 *   - `tenantWhere()` retourne `{}` tant que MULTI_TENANT_ENABLED n'est pas set
 *
 * Quand on activera le mode multi-tenant :
 *   1. Backfill `tenantId` sur User/Booking/Invoice/Pet (migration)
 *   2. `getCurrentTenantId()` lit le subdomain depuis les headers
 *   3. `MULTI_TENANT_ENABLED=true` → `tenantWhere()` injecte le filtre partout
 *
 * Voir docs/MULTI_TENANT_PLAN.md pour la roadmap complète.
 */

const DEFAULT_TENANT = 'default';

export function getCurrentTenantId(): string {
  return process.env.DEFAULT_TENANT_ID ?? DEFAULT_TENANT;
}

export function isMultiTenantEnabled(): boolean {
  return process.env.MULTI_TENANT_ENABLED === 'true';
}

/**
 * À utiliser dans les `where` Prisma futurs :
 *
 *   prisma.booking.findMany({ where: { ...tenantWhere(), status: 'PENDING' } })
 *
 * Tant que `MULTI_TENANT_ENABLED` n'est pas set, retourne `{}` — comportement
 * identique au single-tenant actuel.
 */
export function tenantWhere(tenantId?: string): Record<string, never> | { tenantId: string } {
  if (!isMultiTenantEnabled()) return {};
  return { tenantId: tenantId ?? getCurrentTenantId() };
}
