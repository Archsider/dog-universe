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

function isWithin(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

export function computeMonthlyRevenue(
  payments: AccountingPayment[],
  invoice: AccountingInvoice,
  booking: AccountingBooking | null,
  monthStart: Date,
  monthEnd: Date,
): Prisma.Decimal {
  // CAS 2 & 3 — il y a au moins un paiement → on suit la caisse.
  if (payments.length > 0) {
    let acc = new Prisma.Decimal(0);
    for (const p of payments) {
      if (isWithin(p.paymentDate, monthStart, monthEnd)) {
        acc = acc.plus(new Prisma.Decimal(toNumber(p.amount)));
      }
    }
    return acc;
  }

  // CAS 1 — Aucun paiement.
  const invoiceAmt = new Prisma.Decimal(toNumber(invoice.amount));
  if (booking) {
    const start = booking.startDate;
    // open-ended (isOpenEnded ou endDate null) → l'amount « court » jusqu'à
    // aujourd'hui. Évite la division par zéro lorsque le séjour démarre dans
    // le futur sans encore avoir consommé une nuit.
    const end = booking.endDate ?? new Date();
    const totalNights = Math.max(1, nightsBetween(start, end));
    const inMonth = nightsOverlap(start, end, monthStart, monthEnd);
    if (inMonth === 0) return new Prisma.Decimal(0);
    return invoiceAmt.times(inMonth).dividedBy(totalNights);
  }

  // Pas de booking ni paiement → bucket sur issuedAt.
  return isWithin(invoice.issuedAt, monthStart, monthEnd) ? invoiceAmt : new Prisma.Decimal(0);
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

// Décomposition par catégorie pour un (invoice, items, mois cible).
// Stratégie d'allocation, items pondérés par item.total :
//   - CAS 2/3 : chaque Payment du mois alloué proportionnellement aux items.
//   - CAS 1   : invoice.amount alloué proportionnellement aux items, puis :
//       BOARDING items → prorata par nuits dans le mois,
//       autres        → bucket sur le mois de booking.startDate (jamais issuedAt
//                       quand le booking existe, jamais createdAt).
export function computeMonthlyRevenueByCategory(
  payments: AccountingPayment[],
  invoice: AccountingInvoice,
  items: AccountingItem[],
  booking: AccountingBooking | null,
  monthStart: Date,
  monthEnd: Date,
): CategoryBreakdown {
  const result: CategoryBreakdown = { ...EMPTY_BREAKDOWN };
  const itemsTotal = items.reduce((s, it) => s + toNumber(it.total), 0);
  if (itemsTotal <= 0) return result;

  // CAS 2 & 3 — paiements présents.
  if (payments.length > 0) {
    for (const p of payments) {
      if (!isWithin(p.paymentDate, monthStart, monthEnd)) continue;
      const amt = toNumber(p.amount);
      for (const it of items) {
        const share = amt * (toNumber(it.total) / itemsTotal);
        result[bucketOf(it.category, it.description)] += share;
      }
    }
    return result;
  }

  // CAS 1 — pas de paiement : prorata nuits pour BOARDING, single-bucket
  // pour les autres lignes.
  const invAmt = toNumber(invoice.amount);
  for (const it of items) {
    const share = invAmt * (toNumber(it.total) / itemsTotal);
    const b = bucketOf(it.category, it.description);
    if (b === 'boarding' && booking && booking.endDate && !booking.isOpenEnded) {
      const totalNights = Math.max(1, nightsBetween(booking.startDate, booking.endDate));
      const inMonth = nightsOverlap(booking.startDate, booking.endDate, monthStart, monthEnd);
      if (inMonth > 0) result[b] += share * (inMonth / totalNights);
    } else {
      const ref = booking?.startDate ?? invoice.issuedAt;
      if (isWithin(ref, monthStart, monthEnd)) result[b] += share;
    }
  }
  return result;
}

// Filtre Prisma partagé liste + KPIs : une facture appartient au mois si ses
// dates de séjour tombent ou chevauchent le mois. Fallback issuedAt pour les
// factures manuelles (bookingId IS NULL).
export function getMonthlyInvoicesFilter(monthStart: Date, monthEnd: Date): Prisma.InvoiceWhereInput {
  return {
    OR: [
      {
        bookingId: { not: null },
        booking: {
          OR: [
            { startDate: { gte: monthStart, lte: monthEnd } },
            {
              startDate: { lte: monthEnd },
              OR: [
                { endDate: { gte: monthStart } },
                { isOpenEnded: true },
                { endDate: null },
              ],
            },
          ],
        },
      },
      {
        bookingId: null,
        issuedAt: { gte: monthStart, lte: monthEnd },
      },
    ],
  };
}

