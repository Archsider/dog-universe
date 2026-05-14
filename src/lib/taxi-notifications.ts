// Centralised SMS notifications for taxi trip status transitions.
//
// Used by both manual (admin PATCH) and automatic (geofence auto-transition)
// status changes so the user-visible behaviour is identical.
//
// All sends go through `sendSmsNow` → atomic SmsLog reservation → gateway.
// Guarantees:
//   - The same (phone, message) is sent at most once per 24h window. Two
//     concurrent calls (manual + auto-transition racing) cannot result in
//     two SMS — the loser of the SmsLog INSERT race silently bails.
//   - Fire-and-forget: returns immediately, never blocks the HTTP response
//     of the status transition.
//   - 3 internal retries on actual gateway errors.
//
// DO NOT import `sendSMS`/`sendAdminSMS` directly in this module. Every
// transactional SMS must go through `sendSmsNow` to participate in dedup.
import { sendSmsNow } from '@/lib/notify-now';
import { petVerb, petArrived, petReturned } from '@/lib/sms';

interface PetLite {
  name: string;
  species: string;
  gender?: string | null;
}

interface TaxiTransitionContext {
  clientName: string;
  clientPhone: string | null;
  pets: PetLite[];
}

export async function notifyTaxiTransition(
  newStatus: string,
  ctx: TaxiTransitionContext,
): Promise<void> {
  const firstName = ctx.clientName.split(' ')[0] || ctx.clientName;
  const petNames = ctx.pets.map((p) => p.name).join(' et ') || 'votre animal';

  if (newStatus === 'PLANNED') {
    sendSmsNow({
      to: ctx.clientPhone,
      message: `Bonjour ${firstName} ! 🚗 Le transport de ${petNames} est bien programmé. Dog Universe sera là à l'heure. — Dog Universe`,
    });
    sendSmsNow({ to: 'ADMIN', message: `🚗 Taxi planifié : ${petNames} de ${ctx.clientName}.` });
  } else if (newStatus === 'ON_SITE_CLIENT') {
    sendSmsNow({
      to: ctx.clientPhone,
      message: `Bonjour ${firstName} ! Dog Universe est arrivé à votre adresse pour ${petNames}. — Dog Universe 🚗`,
    });
  } else if (newStatus === 'ANIMAL_ON_BOARD') {
    sendSmsNow({
      to: ctx.clientPhone,
      message: `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} à bord, nous sommes en route. À tout de suite ! — Dog Universe 🚗`,
    });
    sendSmsNow({ to: 'ADMIN', message: `🚗 À bord : ${petNames} de ${ctx.clientName} en route.` });
  } else if (newStatus === 'ARRIVED_AT_PENSION' || newStatus === 'ARRIVED_AT_DESTINATION') {
    sendSmsNow({
      to: ctx.clientPhone,
      message: `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} bien ${petArrived(ctx.pets)} chez Dog Universe. Nous en prenons soin. — Dog Universe 🐾`,
    });
    sendSmsNow({ to: 'ADMIN', message: `🏠 Arrivée pension via taxi : ${petNames} de ${ctx.clientName}.` });
  } else if (newStatus === 'ARRIVED_AT_CLIENT') {
    sendSmsNow({
      to: ctx.clientPhone,
      message: `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} bien ${petReturned(ctx.pets)} à la maison. Merci pour votre confiance. — Dog Universe 🐾`,
    });
    sendSmsNow({ to: 'ADMIN', message: `✅ Rendu : ${petNames} de ${ctx.clientName} livré à domicile.` });
  }
}
