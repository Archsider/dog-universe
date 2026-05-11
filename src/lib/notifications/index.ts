// Re-export core primitives
export type { NotificationType, CreateNotificationData } from './core';
export {
  createNotification,
  createAdminNotifications,
  getUnreadCount,
  invalidateNotifCount,
} from './core';

// Booking domain
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
} from './booking';

// Loyalty domain
export {
  createLoyaltyUpdateNotification,
  createLoyaltyClaimResultNotification,
  notifyAdminsNewLoyaltyClaim,
} from './loyalty';

// Taxi domain
export {
  notifyAdminsTaxiHeartbeatLost,
  createTaxiNearPickupNotification,
  createTaxiArrivedNotification,
  createTaxiArrivingSoonNotification,
} from './taxi';

// Misc (invoices, photos, admin messages, client registration)
export {
  createInvoiceNotification,
  createInvoicePaidNotification,
  createStayPhotoNotification,
  createStayPhotoAddedNotification,
  createAdminMessageNotification,
  notifyAdminsNewClient,
} from './misc';
