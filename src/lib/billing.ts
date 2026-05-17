// SOURCE DE VÉRITÉ COMPTABILITÉ — filtre mensuel unique pour TOUT
// rattachement de facture à un mois (admin/billing, metrics dashboard,
// analytics, KPIs par catégorie).
//
// RÈGLE : ne jamais filtrer par issuedAt/createdAt/periodDate ailleurs.
// Toujours passer par cette fonction.
//
// Une facture appartient au mois [monthStart, monthEnd] si l'un des cas
// suivants est vrai :
//
//   1) Au moins un Payment a été encaissé ce mois (paymentDate ∈ fenêtre)
//      → caisse prime, source de vérité pour le CA encaissé
//
//   2) Aucun paiement encore enregistré ET le séjour est actif sur ce mois
//      (status CONFIRMED / IN_PROGRESS, dates qui chevauchent)
//      → factures en attente, vues dans la liste billing du mois
//
//   3) Facture manuelle sans booking (bookingId null) émise ce mois
//      → ajustements / factures one-shot
//
// Le champ Prisma est `Payment.paymentDate` (libellé "paidAt" dans le langage
// produit). Le mapping est explicite pour éviter toute confusion.

import type { Prisma } from '@prisma/client';
import { notDeleted } from '@/lib/prisma-soft';

// Règle métier verrouillée : tout InvoiceItem lié à un Product (productId
// non-null) DOIT avoir category = 'PRODUCT'. Les appelants passent leur
// catégorie souhaitée + le productId à cette fonction qui force la règle.
// Utilisée dans /api/admin/bookings/[id]/products,
// /api/client/bookings/[id]/add-product, et toute future création.
export function resolveItemCategory(
  productId: string | null | undefined,
  fallback: 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER',
): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  if (productId) return 'PRODUCT';
  return fallback;
}

export function getMonthlyInvoicesWhere(
  monthStart: Date,
  monthEnd: Date,
): Prisma.InvoiceWhereInput {
  return {
    OR: [
      // 1) Au moins un paiement encaissé ce mois.
      {
        payments: {
          some: {
            paymentDate: { gte: monthStart, lte: monthEnd },
          },
        },
      },
      // 2) Aucun paiement DANS LA FENÊTRE ET séjour actif ce mois.
      //    Sémantique : on rattache au mois d'occupation tant qu'aucune
      //    caisse n'a encore matérialisé le mois cible. Une facture déjà
      //    encaissée AVANT le mois cible ne doit pas réapparaître ici.
      //    `deletedAt: null` exclut les bookings soft-deleted (RGPD ou
      //    annulation administrative) — sinon une réservation supprimée
      //    re-pèserait sur le CA "en attente" du mois (regression test
      //    Module 2 case #5).
      {
        payments: { none: { paymentDate: { gte: monthStart, lte: monthEnd } } },
        booking: notDeleted<Prisma.BookingWhereInput>({
          status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
          startDate: { lte: monthEnd },
          OR: [
            { endDate: { gte: monthStart } },
            { isOpenEnded: true },
            { endDate: null },
          ],
        }),
      },
      // 3) Facture manuelle sans booking.
      {
        bookingId: null,
        issuedAt: { gte: monthStart, lte: monthEnd },
      },
    ],
  };
}
