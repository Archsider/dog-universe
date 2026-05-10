// Centralised SMS notifications for taxi trip status transitions.
//
// Used by both manual (admin PATCH) and automatic (geofence auto-transition)
// status changes so the user-visible behaviour is identical.
//
// All sends are fire-and-forget — sendSMS throws on circuit-breaker open /
// timeout / gateway failure; the caller's status transition must succeed
// regardless. We swallow here.
import { sendSMS, sendAdminSMS, petVerb, petArrived, petReturned } from '@/lib/sms';

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

const safeSend = (p: Promise<unknown>) => p.catch(() => undefined);

export async function notifyTaxiTransition(
  newStatus: string,
  ctx: TaxiTransitionContext,
): Promise<void> {
  const firstName = ctx.clientName.split(' ')[0] || ctx.clientName;
  const petNames = ctx.pets.map(p => p.name).join(' et ') || 'votre animal';

  if (newStatus === 'PLANNED') {
    await safeSend(sendSMS(
      ctx.clientPhone,
      `Bonjour ${firstName} ! 🚗 Le transport de ${petNames} est bien programmé. Dog Universe sera là à l'heure. — Dog Universe`,
    ));
    await safeSend(sendAdminSMS(`🚗 Taxi planifié : ${petNames} de ${ctx.clientName}.`));
  } else if (newStatus === 'ON_SITE_CLIENT') {
    await safeSend(sendSMS(
      ctx.clientPhone,
      `Bonjour ${firstName} ! Dog Universe est arrivé à votre adresse pour ${petNames}. — Dog Universe 🚗`,
    ));
  } else if (newStatus === 'ANIMAL_ON_BOARD') {
    await safeSend(sendSMS(
      ctx.clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} à bord, nous sommes en route. À tout de suite ! — Dog Universe 🚗`,
    ));
    await safeSend(sendAdminSMS(`🚗 À bord : ${petNames} de ${ctx.clientName} en route.`));
  } else if (newStatus === 'ARRIVED_AT_PENSION' || newStatus === 'ARRIVED_AT_DESTINATION') {
    await safeSend(sendSMS(
      ctx.clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} bien ${petArrived(ctx.pets)} chez Dog Universe. Nous en prenons soin. — Dog Universe 🐾`,
    ));
    await safeSend(sendAdminSMS(`🏠 Arrivée pension via taxi : ${petNames} de ${ctx.clientName}.`));
  } else if (newStatus === 'ARRIVED_AT_CLIENT') {
    await safeSend(sendSMS(
      ctx.clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(ctx.pets, 'present')} bien ${petReturned(ctx.pets)} à la maison. Merci pour votre confiance. — Dog Universe 🐾`,
    ));
    await safeSend(sendAdminSMS(`✅ Rendu : ${petNames} de ${ctx.clientName} livré à domicile.`));
  }
}
