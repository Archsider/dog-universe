// Backward-compat shim. Implementations moved under `src/lib/metrics/`
// split into `revenue.ts` (Sémantique A/B allocator + cached path) and
// `operations.ts` (occupancy, volumes, basket, new clients).
//
// New code should import directly from `@/lib/metrics`. Existing
// consumers (admin/analytics) keep working unchanged because the re-export
// preserves the public surface.

export * from './metrics/index';
