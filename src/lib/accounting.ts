// Comptabilité — règles métier de rattachement du chiffre d'affaires à un mois.
//
// Source de vérité : Payment.paymentDate (= "paidAt" dans le langage produit).
// La caisse prime sur tout. Trois cas exclusifs :
//
//   CAS 1 — Aucun paiement enregistré sur la facture :
//     prorata des nuits réelles. Pour chaque mois cible :
//       montant = invoice.amount × (nuits dans le mois / total nuits)
//     Si pas de booking (facture manuelle), on rattache au mois de issuedAt.
//
//   CAS 2 — Paiements partiels :
//     chaque Payment.amount est comptabilisé dans le mois de son paymentDate.
//     1 000 MAD encaissés en avril → CA avril ; 940 MAD en mai → CA mai.
//
//   CAS 3 — Paiement total anticipé (couvert par CAS 2) :
//     un séjour 20 avril → 15 mai entièrement payé 1 940 MAD le 20 avril
//     compte 100 % en avril, 0 en mai.
//
// La fonction est pure (pas d'I/O) — l'appelant fournit les données.
//
// Deux variantes :
//   - computeMonthlyRevenue : total pour un (invoice, mois cible)
//   - computeMonthlyRevenueByCategory : décomposition par InvoiceItem.category,
//     allocation pondérée par item.total. Utilisée pour les KPIs par service.

import { Prisma } from '@prisma/client';
import { toNumber, type DecimalLike } from '@/lib/decimal';
import { inferItemCategory } from '@/lib/category';

const MS_PER_DAY = 86_400_000;

export interface AccountingItem {
  category: string;
  description?: string | null;
  total: DecimalLike;
}

export interface AccountingPayment {
  amount: DecimalLike;
  paymentDate: Date;
}

export interface AccountingInvoice {
  amount: DecimalLike;
  issuedAt: Date;
}

export interface AccountingBooking {
  startDate: Date;
  endDate: Date | null;
  isOpenEnded?: boolean | null;
}

function nightsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
}

function nightsOverlap(bStart: Date, bEnd: Date, wStart: Date, wEnd: Date): number {
  const start = bStart > wStart ? bStart : wStart;
  const end = bEnd < wEnd ? bEnd : wEnd;
  if (end.getTime() <= start.getTime()) return 0;
  return nightsBetween(start, end);
}

// Nuits réellement consommées dans la fenêtre [monthStart, monthEnd] pour un
// séjour [startDate, endDate]. Open-ended (endDate null) → on borne au mois.
export function countNightsInMonth(
  startDate: Date,
  endDate: Date | null,
  monthStart: Date,
  monthEnd: Date,
): number {
  return nightsOverlap(startDate, endDate ?? monthEnd, monthStart, monthEnd);
}

function isWithin(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

// Total encaissé pour une facture sur le mois cible. Règle « caisse prime » :
// uniquement la somme des Payment.amount dont paymentDate ∈ [monthStart, monthEnd].
// Aucun prorata fictif — une facture sans payment compte 0 dans les KPIs encaissés.
// Les paramètres invoice/booking restent dans la signature pour stabilité, ils
// ne sont plus utilisés (gardés pour limiter la blast radius des call sites).
export function computeMonthlyRevenue(
  payments: AccountingPayment[],
  _invoice: AccountingInvoice,
  _booking: AccountingBooking | null,
  monthStart: Date,
  monthEnd: Date,
): Prisma.Decimal {
  let acc = new Prisma.Decimal(0);
  for (const p of payments) {
    if (isWithin(p.paymentDate, monthStart, monthEnd)) {
      acc = acc.plus(new Prisma.Decimal(toNumber(p.amount)));
    }
  }
  return acc;
}

export type CategoryBreakdown = {
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
  other: number;
};

const EMPTY_BREAKDOWN: CategoryBreakdown = {
  boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
};

// Catégorie → bucket KPI. PRODUCT est rendu sous "croquettes" (libellé legacy).
function bucketOf(category: string, description?: string | null): keyof CategoryBreakdown {
  const k = inferItemCategory(category, description ?? undefined);
  if (k === 'BOARDING') return 'boarding';
  if (k === 'PET_TAXI') return 'taxi';
  if (k === 'GROOMING') return 'grooming';
  if (k === 'PRODUCT') return 'croquettes';
  return 'other';
}

// Décomposition par catégorie pour un (payments, items, mois cible).
//
// RÈGLE MÉTIER DÉFINITIVE — La caisse prime, allocation séquentielle :
//   - Source de vérité = Payment.paymentDate. Pas de prorata fictif.
//   - Aucun paiement enregistré → 0 partout (la facture reste « en attente »).
//   - Sinon : payments triés par date asc, items dans l'ordre reçu (le caller
//     doit fournir orderBy id asc côté Prisma — cuid est chronologique). Chaque
//     payment est consommé séquentiellement contre les items en cours, et
//     **uniquement** comptabilisé si Payment.paymentDate tombe dans le mois cible.
//   - Un item ne se coupe jamais en deux mois côté logique : la portion allouée
//     à un paiement reste indivisible. C'est la *date du payment* qui décide.
export function computeMonthlyRevenueByCategory(
  payments: AccountingPayment[],
  items: AccountingItem[],
  monthStart: Date,
  monthEnd: Date,
): CategoryBreakdown {
  const result: CategoryBreakdown = { ...EMPTY_BREAKDOWN };
  if (payments.length === 0 || items.length === 0) return result;

  const sortedPayments = [...payments].sort(
    (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime(),
  );

  // Restant à allouer par item (Decimal — précision centime).
  const itemRemaining: Prisma.Decimal[] = items.map(
    (it) => new Prisma.Decimal(toNumber(it.total)),
  );
  let itemIdx = 0;

  for (const payment of sortedPayments) {
    const isThisMonth = isWithin(payment.paymentDate, monthStart, monthEnd);
    let remaining = new Prisma.Decimal(toNumber(payment.amount));

    while (remaining.gt(0) && itemIdx < items.length) {
      const slot = itemRemaining[itemIdx];
      const allocated = Prisma.Decimal.min(remaining, slot);

      if (isThisMonth && allocated.gt(0)) {
        const bucket = bucketOf(items[itemIdx].category, items[itemIdx].description);
        result[bucket] += allocated.toNumber();
      }

      remaining = remaining.minus(allocated);
      itemRemaining[itemIdx] = slot.minus(allocated);

      if (itemRemaining[itemIdx].lte(0)) {
        itemIdx += 1;
      }
    }
  }

  return result;
}

// Filtre mensuel comptabilité : déplacé dans `src/lib/billing.ts` —
// `getMonthlyInvoicesWhere(monthStart, monthEnd)`. Source de vérité unique
// pour TOUT rattachement de facture à un mois (caisse + en attente + manuel).

