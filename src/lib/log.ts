import { prisma } from './prisma';

interface LogActionData {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAction(data: LogActionData): Promise<void> {
  try {
    await prisma.actionLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        details: data.details ? JSON.stringify(data.details) : undefined,
        ipAddress: data.ipAddress,
      },
    });
  } catch (error) {
    // Logs should never break the main flow
    console.error('Failed to write action log:', error);
  }
}

export const LOG_ACTIONS = {
  // Auth
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_REGISTER: 'USER_REGISTER',
  PASSWORD_RESET: 'PASSWORD_RESET',

  // Pets
  PET_CREATED: 'PET_CREATED',
  PET_UPDATED: 'PET_UPDATED',
  PET_DELETED: 'PET_DELETED',

  // Bookings
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',

  // Invoices
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_PAID: 'INVOICE_PAID',
  INVOICE_DOWNLOADED: 'INVOICE_DOWNLOADED',

  // Loyalty
  LOYALTY_GRADE_AUTO: 'LOYALTY_GRADE_AUTO',
  LOYALTY_GRADE_OVERRIDE: 'LOYALTY_GRADE_OVERRIDE',

  // Notifications
  NOTIFICATION_SENT: 'NOTIFICATION_SENT',

  // Admin
  ADMIN_NOTE_ADDED: 'ADMIN_NOTE_ADDED',
  CLIENT_STATUS_CHANGED: 'CLIENT_STATUS_CHANGED',
} as const;
