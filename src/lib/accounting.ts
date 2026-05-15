// Comptabilité — règles métier de rattachement du chiffre d'affaires à un mois.
//
// ═══════════════════════════════════════════════════════════════════════════
// SÉMANTIQUE A — "Facture clôturée ce mois" (active depuis 2026-05-15)
// ═══════════════════════════════════════════════════════════════════════════
//
// **Règle unique :** une facture contribue au CA ventilé par catégorie d'un
// mois UNIQUEMENT si :
//   (1) elle est intégralement payée (somme des Payment.amount ≥ Invoice.amount,
//       tolérance 1 centime pour l'arrondi DECIMAL(10,2))
//   (2) le DERNIER paiement (max paymentDate) tombe dans la fenêtre [monthStart,
//       monthEnd].
//
// Quand ces deux conditions sont vraies, chaque item est crédité à 100 % de
// son `total` au bucket de sa catégorie pour ce mois-là. Sinon : 0.
//
// **Conséquences immédiates :**
//   - Les factures `PARTIALLY_PAID` ne contribuent PAS au CA ventilé tant
//     qu'elles ne sont pas closes. C'est une décision explicite (cohérent
//     "caisse close" comptable, défendable au comptable Maroc TVA à
//     l'encaissement). Le KPI "encaissé brut total" (somme Payment.amount)
//     les voit toujours — c'est cette ventilation par catégorie qui les
//     exclut tant qu'elles bougent encore.
//   - 1 facture = 1 mois (jamais répartie sur 2 mois). Un long séjour à
//     cheval avril-mai, payé intégralement le 6 mai, bascule TOUT en mai.
//   - Indépendant de l'ordre de saisie des items (vs ancien algo FIFO qui
//     attribuait selon l'ordre `cuid asc` — non déterministe métier).
//
// **Pourquoi pas le prorata (sémantique B) ni l'allocation explicite (C) :**
// voir docs/REVENUE_ATTRIBUTION_DECISION.md pour le compare + la décision
// argumentée. Cas de référence pour cette sémantique = DU-2026-0030 (Kabbaj
// Rita, mai 2026) — test régression figé dans __tests__/billing.test.ts.
//
// **Source de vérité = caisse :** `Payment.paymentDate`. Pas de `issuedAt`,
// pas de `createdAt`, pas de `Booking.startDate`. La date d'émission d'une
// facture est une métadonnée technique ; la caisse est la vérité comptable.
//
// **Pureté :** les deux fonctions exportées sont pures (pas d'I/O). L'appelant
// fournit les rows déjà chargées via Prisma.
//
//   - computeMonthlyRevenueByCategory : breakdown { boarding, taxi, grooming,
//     croquettes, other } pour un mois cible
//   - allocateBetweenItems            : breakdown par item pour le drill-down
//     /admin/analytics
//
// Les deux appliquent la même règle gate (1)+(2). Si la gate est fausse,
// chaque retour est à zéro / vide.

import { Prisma } from '@prisma/client';
import { toNumber, type DecimalLike } from '@/lib/decimal';
import { inferItemCategory } from '@/lib/category';

const FULL_PAID_TOLERANCE = new Prisma.Decimal('0.01');

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
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function nightsOverlap(bStart: Date, bEnd: Date, wStart: Date, wEnd: Date): number {
  const start = bStart > wStart ? bStart : wStart;
  const end = bEnd < wEnd ? bEnd : wEnd;
  if (end.getTime() <= start.getTime()) return 0;
  return nightsBetween(start, end);
}

// Nuits réellement consommées dans la fenêtre [monthStart, monthEnd] pour un
// séjour [startDate, endDate]. Conservé pour les helpers /admin/analytics qui
// rapportent la "durée moyenne de séjour" — n'a aucun lien avec la sémantique
// A d'attribution des paiements.
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

// Total brut encaissé pour une facture sur le mois cible. Cette fonction garde
// l'ancienne sémantique "caisse pure" (somme des Payment.amount du mois) parce
// qu'elle alimente les KPI "encaissé brut total" — pas la ventilation par
// catégorie. Les deux KPIs coexistent : "j'ai mis 940 MAD dans la caisse en
// mai" (cette fonction) vs "j'ai clôturé une vente de 940 MAD en mai"
// (sémantique A, ci-dessous).
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

// Helpers internes — partagés par les deux fonctions publiques.
function sumPayments(payments: AccountingPayment[]): Prisma.Decimal {
  return payments.reduce(
    (acc, p) => acc.plus(new Prisma.Decimal(toNumber(p.amount))),
    new Prisma.Decimal(0),
  );
}

function sumItems(items: AccountingItem[]): Prisma.Decimal {
  return items.reduce(
    (acc, it) => acc.plus(new Prisma.Decimal(toNumber(it.total))),
    new Prisma.Decimal(0),
  );
}

function lastPaymentDate(payments: AccountingPayment[]): Date {
  return payments.reduce(
    (max, p) => (p.paymentDate.getTime() > max.getTime() ? p.paymentDate : max),
    payments[0].paymentDate,
  );
}

// Sémantique A — gate "facture clôturée ce mois".
// True si (1) la facture est intégralement payée à la tolérance centime près
// ET (2) la date du dernier payment tombe dans la fenêtre cible. Pure.
export function isInvoiceClosedInMonth(
  payments: AccountingPayment[],
  items: AccountingItem[],
  monthStart: Date,
  monthEnd: Date,
): boolean {
  if (payments.length === 0 || items.length === 0) return false;
  const totalPaid = sumPayments(payments);
  const invoiceTotal = sumItems(items);
  if (totalPaid.lt(invoiceTotal.minus(FULL_PAID_TOLERANCE))) return false;
  return isWithin(lastPaymentDate(payments), monthStart, monthEnd);
}

// Décomposition par catégorie pour un (payments, items, mois cible).
// Implémente la sémantique A décrite en haut du fichier.
export function computeMonthlyRevenueByCategory(
  payments: AccountingPayment[],
  items: AccountingItem[],
  monthStart: Date,
  monthEnd: Date,
): CategoryBreakdown {
  const result: CategoryBreakdown = { ...EMPTY_BREAKDOWN };
  if (!isInvoiceClosedInMonth(payments, items, monthStart, monthEnd)) return result;

  for (const it of items) {
    const bucket = bucketOf(it.category, it.description);
    result[bucket] += toNumber(it.total);
  }
  return result;
}

// Allocation par item pour le drill-down /admin/analytics. Sous sémantique A,
// si la facture est close ce mois → chaque item porte son `total` complet,
// tagué avec la date du dernier payment. Sinon → toutes les allocations à 0.
export interface ItemAllocation {
  amount: Prisma.Decimal;
  lastPaidAt: Date | null;
}

export function allocateBetweenItems(
  payments: AccountingPayment[],
  items: AccountingItem[],
  monthStart: Date,
  monthEnd: Date,
): ItemAllocation[] {
  const allocations: ItemAllocation[] = items.map(() => ({
    amount: new Prisma.Decimal(0),
    lastPaidAt: null,
  }));
  if (!isInvoiceClosedInMonth(payments, items, monthStart, monthEnd)) return allocations;

  const closedAt = lastPaymentDate(payments);
  for (let i = 0; i < items.length; i++) {
    allocations[i] = {
      amount: new Prisma.Decimal(toNumber(items[i].total)),
      lastPaidAt: closedAt,
    };
  }
  return allocations;
}

// Filtre mensuel comptabilité : déplacé dans `src/lib/billing.ts` —
// `getMonthlyInvoicesWhere(monthStart, monthEnd)`. Source de vérité unique
// pour TOUT rattachement de facture à un mois (caisse + en attente + manuel).
