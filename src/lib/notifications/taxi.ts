import { NOTIFICATION_MESSAGES } from '@/lib/notification-messages';
import { createNotification, createAdminNotifications } from './core';

export async function notifyAdminsTaxiHeartbeatLost(args: {
  bookingId: string;
  bookingRef: string;
  clientName: string;
  petNames: string;
}) {
  const msg = NOTIFICATION_MESSAGES.TAXI_HEARTBEAT_LOST({
    clientName: args.clientName,
    petNames: args.petNames,
    bookingRef: args.bookingRef,
  });
  return createAdminNotifications({
    type: 'TAXI_HEARTBEAT_LOST',
    ...msg,
    metadata: { bookingId: args.bookingId, bookingRef: args.bookingRef },
  });
}

export async function createTaxiNearPickupNotification(
  userId: string,
  bookingId: string,
  distance: number,
  _lang: string,
) {
  const msg = NOTIFICATION_MESSAGES.TAXI_NEAR_PICKUP({});
  return createNotification({
    userId,
    type: 'TAXI_NEAR_PICKUP',
    ...msg,
    metadata: { bookingId, distance: String(Math.round(distance)) },
  });
}

export async function createTaxiArrivedNotification(
  userId: string,
  bookingId: string,
  _lang: string,
) {
  const msg = NOTIFICATION_MESSAGES.TAXI_ARRIVED({});
  return createNotification({ userId, type: 'TAXI_ARRIVED', ...msg, metadata: { bookingId } });
}

export async function createTaxiArrivingSoonNotification(
  userId: string,
  bookingId: string,
  etaSec: number,
  _locale: string,
) {
  const minutes = Math.max(1, Math.round(etaSec / 60));
  const msg = NOTIFICATION_MESSAGES.TAXI_ARRIVING_SOON({ minutes: String(minutes) });
  return createNotification({
    userId,
    type: 'TAXI_ARRIVING_SOON',
    ...msg,
    metadata: { bookingId, etaSec: String(etaSec) },
  });
}
