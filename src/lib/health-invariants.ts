// Backward-compat shim. The invariant implementations now live under
// `src/lib/invariants/` split by domain (invoice / stock / revenue) —
// this file just re-exports the public surface so existing consumers
// keep working without an import-path migration.
//
// New code should import directly from `@/lib/invariants`. This shim
// stays in place because:
//   - It's two lines, zero maintenance.
//   - The ESLint rule `no-direct-revenue-computation` whitelists this
//     filename for the SUM(Payment.amount) reads used by
//     `checkPaymentAttributionDrift`; the whitelist follows the export,
//     so a re-export shim keeps the policy intact.

export * from './invariants';
