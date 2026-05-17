/**
 * Post-commit notification fan-out for newly created bookings.
 *
 * Handles admin SMS + admin email loop when a client (non-admin) creates
 * a booking. Extracted from POST /api/bookings to keep the route ≤ 200 lines.
 */
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { sendEmailNow, sendSmsNow } from '@/lib/notify-now';
import { formatDateFR } from '@/lib/sms';
import { logger } from '@/lib/logger';
import { APP_URL } from '@/lib/config';
import * as Sentry from '@sentry/nextjs';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface NotifyNewBookingArgs {
  bookingId: string;
  bookingRef: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  clientLabel: string; // name ?? email
  petNames: string;
  startDate: Date;
  endDate: Date | null;
}

/**
 * Fire-and-forget admin notifications (SMS + email per admin).
 * Never throws — all errors are swallowed and logged.
 */
export function notifyAdminsBookingCreated(args: NotifyNewBookingArgs): void {
  const dateRangeSMS =
    args.serviceType === 'BOARDING' && args.endDate
      ? `du ${formatDateFR(args.startDate)} au ${formatDateFR(args.endDate)}`
      : `le ${formatDateFR(args.startDate)}`;

  sendSmsNow({
    to: 'ADMIN',
    message: `🔔 Nouvelle réservation : ${args.clientLabel} pour ${args.petNames} ${dateRangeSMS}.`,
  });

  Sentry.startSpan({ name: 'booking.enqueueAdminEmails', op: 'queue' }, async () => {
    try {
      const appUrl = APP_URL;
      const admins = await prisma.user.findMany({
        where: { ...notDeleted(), role: { in: ['ADMIN', 'SUPERADMIN'] } }, // soft-delete: required — no global extension (Edge Runtime incompatible)
        select: { email: true, language: true },
      });
      const serviceLabelFr = args.serviceType === 'BOARDING' ? 'Pension' : 'Taxi animalier';
      const serviceLabelEn = args.serviceType === 'BOARDING' ? 'Boarding' : 'Pet Taxi';
      const dateRangeHtml =
        args.serviceType === 'BOARDING' && args.endDate
          ? `du <strong>${formatDateFR(args.startDate)}</strong> au <strong>${formatDateFR(args.endDate)}</strong>`
          : `le <strong>${formatDateFR(args.startDate)}</strong>`;
      const dateRangeHtmlEn =
        args.serviceType === 'BOARDING' && args.endDate
          ? `from <strong>${formatDateFR(args.startDate)}</strong> to <strong>${formatDateFR(args.endDate)}</strong>`
          : `on <strong>${formatDateFR(args.startDate)}</strong>`;

      await Promise.all(
        admins.map((admin) => {
          const isFr = (admin.language ?? 'fr') === 'fr';
          const subject = isFr
            ? `🔔 Nouvelle réservation — ${args.clientLabel}`
            : `🔔 New booking — ${args.clientLabel}`;
          const html = isFr
            ? `<p>Bonjour,</p>
               <p>Nouvelle demande de réservation (${esc(serviceLabelFr)}) :</p>
               <ul>
                 <li>Client : <strong>${esc(args.clientLabel)}</strong></li>
                 <li>Animal(aux) : <strong>${esc(args.petNames)}</strong></li>
                 <li>Dates : ${dateRangeHtml}</li>
                 <li>Réf. : <code>${esc(args.bookingRef)}</code></li>
               </ul>
               <p><a href="${appUrl}/fr/admin/reservations/${args.bookingId}">Voir et valider la réservation</a></p>
               <p>— Dog Universe CRM</p>`
            : `<p>Hello,</p>
               <p>New booking request (${esc(serviceLabelEn)}):</p>
               <ul>
                 <li>Client: <strong>${esc(args.clientLabel)}</strong></li>
                 <li>Pet(s): <strong>${esc(args.petNames)}</strong></li>
                 <li>Dates: ${dateRangeHtmlEn}</li>
                 <li>Ref.: <code>${esc(args.bookingRef)}</code></li>
               </ul>
               <p><a href="${appUrl}/en/admin/reservations/${args.bookingId}">Review and confirm</a></p>
               <p>— Dog Universe CRM</p>`;
          sendEmailNow({ to: admin.email, subject, html });
          return Promise.resolve();
        }),
      );
    } catch (err) {
      logger.error('booking', 'admin new booking notification loop failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }).catch(() => {});
}
