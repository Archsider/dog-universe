import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { cacheReadThrough, cacheDel, CacheKeys, CacheTTL } from '@/lib/cache';
import { notDeleted } from '@/lib/prisma-soft';

export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_VALIDATION'
  | 'BOOKING_REFUSAL'
  | 'BOOKING_IN_PROGRESS'
  | 'BOOKING_COMPLETED'
  | 'STAY_REMINDER'
  | 'STAY_END_REMINDER'         // client receives J-1 before boarding end
  | 'INVOICE_AVAILABLE'
  | 'INVOICE_PAID'              // client receives when invoice is marked paid
  | 'ADMIN_MESSAGE'
  | 'STAY_PHOTO'
  | 'LOYALTY_UPDATE'
  | 'PET_BIRTHDAY'
  | 'BOOKING_REQUEST'           // admin receives when a client creates a booking
  | 'LOYALTY_CLAIM_PENDING'     // admin receives when a client submits a claim
  | 'NEW_CLIENT_REGISTRATION'   // admin receives when a new client registers
  | 'EXTENSION_REQUEST'         // admin receives when a client requests a stay extension
  | 'ADDON_REQUEST'             // admin receives when a client requests an additional service on a booking
  | 'TAXI_HEARTBEAT_LOST'       // admin receives when no GPS heartbeat for >5 min on an active taxi trip
  | 'TAXI_NEAR_PICKUP'          // client receives when driver is within ~1 km of pickup location
  | 'TAXI_ARRIVED'              // client receives when driver is within ~100 m of pickup location
  | 'TAXI_ARRIVING_SOON'        // client receives when ETA to pickup drops below 5 min
  | 'BOOKING_EXTENDED'          // client receives when stay is extended (admin direct or approved)
  | 'BOOKING_NO_SHOW'           // client receives when booking is marked NO_SHOW by admin
  | 'BOOKING_WAITLISTED'        // client receives when booking is queued on the waitlist
  | 'BOOKING_WAITLIST_PROMOTED' // client receives when waitlisted booking is promoted to PENDING
  | 'BOOKING_CANCELLED'         // admin receives when a client cancels a booking
  | 'BOOKING_RESCHEDULE_REQUEST' // admin receives when a client requests new dates
  | 'STAY_PHOTO_ADDED'           // client receives when new stay photos are uploaded (Instagram-like feed)
  | 'WEEKLY_PET_REPORT'         // client receives weekly AI-generated stay report during IN_PROGRESS boarding
  | 'INVOICE_OVERDUE'           // client receives when an invoice is unpaid at J+30 then J+60
  | 'REVIEW_REQUEST'            // client receives after a completed stay to submit a review
  | 'END_STAY_REPORT'           // client receives at checkout — structured narrative report (see EndStayReport table)
  | 'DAILY_REPORT'              // client receives a daily card while pet is boarding (see DailyReport table)
  | 'CLIENT_ARRIVAL_NEARBY'     // admin receives when a client checks in via geolocation near the facility
  | 'PRODUCT_ORDER'             // admin receives when a client orders a product on an active booking
  | 'BOOKING_TIME_PROPOSED'     // client receives when admin proposes a specific time (arrival / taxi go / taxi return)
  | 'BOOKING_TIME_CONFIRMED'    // client receives when a time proposal is accepted (by either side)
  | 'INVOICE_CANCELLED';        // client receives when one of their invoices is cancelled by admin

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  titleFr: string;
  titleEn: string;
  titleAr?: string;
  messageFr: string;
  messageEn: string;
  messageAr?: string;
  metadata?: Record<string, string>;
}

export async function createNotification(data: CreateNotificationData) {
  const created = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      titleFr: data.titleFr,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      messageFr: data.messageFr,
      messageEn: data.messageEn,
      messageAr: data.messageAr,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      read: false,
    },
  });
  // Invalidate the cached unread count so the recipient's bell badge
  // reflects the new notification within their next request.
  await invalidateNotifCount(data.userId);
  return created;
}

export async function createAdminNotifications(data: Omit<CreateNotificationData, 'userId'>) {
  const admins = await prisma.user.findMany({
    where: notDeleted<Prisma.UserWhereInput>({ role: { in: ['ADMIN', 'SUPERADMIN'] } }), // soft-delete: required — no global extension (Edge Runtime incompatible)
    select: { id: true },
  });
  return Promise.all(admins.map((admin) => createNotification({ ...data, userId: admin.id })));
}

export async function getUnreadCount(userId: string): Promise<number> {
  return cacheReadThrough<number>(
    CacheKeys.notifCount(userId),
    CacheTTL.notifCount,
    // `deletedAt: null` — soft-deleted ADMIN_MESSAGE / END_STAY_REPORT
    // disappear from the bell badge count even if they were still unread
    // at the moment the admin clicked "Supprimer".
    () => prisma.notification.count({ where: notDeleted({ userId, read: false }) }),
  );
}

/** Invalidate the cached unread-count for a user. Call after creating a
 *  notification for them or after they mark one as read. */
export async function invalidateNotifCount(userId: string): Promise<void> {
  await cacheDel(CacheKeys.notifCount(userId));
}
