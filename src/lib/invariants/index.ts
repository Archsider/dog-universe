// Public surface of the invariants module — one barrel file so consumers
// can keep doing `import { ... } from '@/lib/invariants'`. The actual
// implementations live in domain-specific files (invoice / stock /
// revenue). See each for context.

export type { InvariantResult } from './types';

export {
  checkOverpaidInvoices,
  checkItemTotalDrift,
  checkInvoiceAmountDrift,
  checkAllocatedSumVsPaid,
  checkPaymentSumVsPaid,
  checkItemAllocatedOverflow,
  checkFullyPaidMissingPaidAt,
} from './invoice';

export { checkNegativeStock } from './stock';

export {
  checkMonthlyRevenueMvFresh,
  checkPaymentAttributionDrift,
  checkRevenueHelperVsLive,
} from './revenue';

import {
  checkOverpaidInvoices,
  checkItemTotalDrift,
  checkInvoiceAmountDrift,
  checkAllocatedSumVsPaid,
  checkPaymentSumVsPaid,
  checkItemAllocatedOverflow,
  checkFullyPaidMissingPaidAt,
} from './invoice';
import { checkNegativeStock } from './stock';
import {
  checkMonthlyRevenueMvFresh,
  checkPaymentAttributionDrift,
  checkRevenueHelperVsLive,
} from './revenue';
import type { InvariantResult } from './types';

export async function runAllInvariantChecks(): Promise<InvariantResult[]> {
  const [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh,
    paymentAttribDrift, helperVsLive,
  ] = await Promise.all([
    checkOverpaidInvoices(),
    checkNegativeStock(),
    checkItemTotalDrift(),
    checkInvoiceAmountDrift(),
    checkAllocatedSumVsPaid(),
    checkPaymentSumVsPaid(),
    checkItemAllocatedOverflow(),
    checkFullyPaidMissingPaidAt(),
    checkMonthlyRevenueMvFresh(),
    checkPaymentAttributionDrift(),
    checkRevenueHelperVsLive(),
  ]);
  return [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh,
    paymentAttribDrift, helperVsLive,
  ];
}
