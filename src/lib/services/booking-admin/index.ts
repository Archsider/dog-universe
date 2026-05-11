/**
 * Barrel for the admin booking PATCH services.
 *
 * The route handler `src/app/api/admin/bookings/[id]/route.ts` is a thin
 * dispatcher: it validates the body, runs cross-cutting guards (authz,
 * version lock, status preconditions) and then delegates to one of the
 * services exported here. Services are HTTP-agnostic and throw `BookingError`.
 *
 * See `./README.md` for the dispatch contract.
 */
export { adminBookingPatchSchema, adminBookingParamsSchema, VALID_BOOKING_STATUSES } from './schemas';
export type { AdminBookingPatchBody } from './schemas';

export {
  approveExtensionMerge,
  rejectExtensionMerge,
  applyExtension,
} from './extension';
export type {
  ApproveExtensionMergeArgs,
  RejectExtensionMergeArgs,
  ApplyExtensionArgs,
} from './extension';

export { editDates } from './edit-dates';
export type { EditDatesArgs } from './edit-dates';

export {
  applyStatusUpdate,
  handleNoShowInvoice,
  runStatusSideEffects,
} from './status-transitions';
export type {
  ApplyStatusUpdateArgs,
  NoShowInvoiceHandlingArgs,
  RunStatusSideEffectsArgs,
} from './status-transitions';

// Re-export pre-existing services from the umbrella module so consumers can
// import everything from a single path.
export {
  patchBoardingDetail,
  addBookingItems,
  rejectExtensionRequest,
} from '../booking-admin.service';
