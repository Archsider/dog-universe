// Admin-side notifications triggered by client actions on TimeProposal
// public-token endpoints. Imported lazily by the route handlers so the
// build doesn't pull the entire notification stack on every cold start.
//
// Source : architecture proposal 2026-05-17 — time confirmation flow.

import { createAdminNotifications } from './core';

const SCOPE_LABEL: Record<string, { fr: string; en: string }> = {
  ARRIVAL:     { fr: "l'arrivée", en: 'arrival' },
  TAXI_GO:     { fr: 'le taxi aller', en: 'taxi outbound' },
  TAXI_RETURN: { fr: 'le taxi retour', en: 'taxi return' },
};

export async function notifyAdminsBookingTimeAccepted(args: {
  bookingId: string;
  scope: 'ARRIVAL' | 'TAXI_GO' | 'TAXI_RETURN';
  time: string;
}) {
  const label = SCOPE_LABEL[args.scope];
  return createAdminNotifications({
    type: 'ADMIN_MESSAGE',
    titleFr: 'Heure acceptée par le client',
    titleEn: 'Time accepted by client',
    titleAr: 'تم قبول الوقت من قبل العميل',
    messageFr: `Le client a accepté ${args.time} pour ${label.fr}.`,
    messageEn: `Client accepted ${args.time} for ${label.en}.`,
    messageAr: `قبل العميل الوقت ${args.time} لـ ${label.en}.`,
    metadata: { bookingId: args.bookingId, scope: args.scope, time: args.time, kind: 'time_accepted' },
  });
}

export async function notifyAdminsBookingTimeRejected(args: {
  bookingId: string;
  scope: 'ARRIVAL' | 'TAXI_GO' | 'TAXI_RETURN';
  note: string;
}) {
  const label = SCOPE_LABEL[args.scope];
  return createAdminNotifications({
    type: 'ADMIN_MESSAGE',
    titleFr: 'Heure refusée par le client',
    titleEn: 'Time rejected by client',
    titleAr: 'تم رفض الوقت من قبل العميل',
    messageFr: `Le client a refusé l'heure proposée pour ${label.fr}. Motif : ${args.note}`,
    messageEn: `Client rejected the proposed time for ${label.en}. Reason: ${args.note}`,
    messageAr: `رفض العميل الوقت المقترح لـ ${label.en}. السبب: ${args.note}`,
    metadata: { bookingId: args.bookingId, scope: args.scope, note: args.note, kind: 'time_rejected' },
  });
}
