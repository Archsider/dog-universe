// Public surface of the metrics module — barrel for the existing
// `@/lib/metrics` import path. Implementations live in domain files
// (revenue / operations).

export type { MonthlyEntry, CategoryBreakdown } from './revenue';
export {
  cashByMonth,
  computeRevenueByCategoryProrataLive,
  revenueByCategoryProrata,
  billedByCategory,
} from './revenue';

export {
  deltaPercent,
  volumeByCategory,
  avgBasket,
  currentBoarders,
  pendingBookingsCount,
  newClientsCount,
} from './operations';

// Re-export pour rétro-compat des call sites existants (analytics, etc.).
export { inferItemCategory, categoryKey } from '../category';
