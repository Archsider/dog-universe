/**
 * @/lib/notifications — public barrel
 *
 * Re-exports every notification helper from the domain sub-modules.
 * Import paths remain `@/lib/notifications` everywhere — this file is
 * kept as the stable public surface so existing call-sites do not need
 * to change.
 *
 * Internal layout:
 *   src/lib/notifications/core.ts   — createNotification, createAdminNotifications, cache helpers
 *   src/lib/notifications/booking.ts — booking / extension / waitlist / addon / product
 *   src/lib/notifications/loyalty.ts — grade updates + claim results
 *   src/lib/notifications/taxi.ts    — heartbeat-lost, geofencing (near/arrived/arriving-soon)
 *   src/lib/notifications/misc.ts    — invoices, stay-photos, admin messages, new-client
 */
export type { NotificationType, CreateNotificationData } from './notifications/core';
export {
  createNotification,
  createAdminNotifications,
  getUnreadCount,
  invalidateNotifCount,
} from './notifications/core';

export {
  createBookingConfirmationNotification,
  createBookingValidationNotification,
  createBookingRefusalNotification,
  createBookingInProgressNotification,
  createBookingCompletedNotification,
  notifyAdminsNewBooking,
  notifyAdminsExtensionRequest,
  createBookingExtendedNotification,
  createExtensionRejectedNotification,
  createBookingNoShowNotification,
  createBookingWaitlistedNotification,
  createWaitlistPromotedNotification,
  promoteWaitlistedBooking,
  notifyAdminsAddonRequest,
  notifyAdminsProductOrder,
  createTimeProposedNotification,
  createTimeConfirmedNotification,
  createBookingCancelledNotification,
} from './notifications/booking';

export {
  createLoyaltyUpdateNotification,
  createLoyaltyClaimResultNotification,
  notifyAdminsNewLoyaltyClaim,
} from './notifications/loyalty';

export {
  notifyAdminsTaxiHeartbeatLost,
  createTaxiNearPickupNotification,
  createTaxiArrivedNotification,
  createTaxiArrivingSoonNotification,
} from './notifications/taxi';

export {
  createInvoiceNotification,
  createInvoicePaidNotification,
  createStayPhotoNotification,
  createStayPhotoAddedNotification,
  createAdminMessageNotification,
  createEndStayReportNotification,
  notifyAdminsNewClient,
} from './notifications/misc';
