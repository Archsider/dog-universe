import { Banknote, CreditCard, Receipt, Building2 } from 'lucide-react';
import type { Decimal } from '@prisma/client/runtime/library';

// ── Types ───────────────────────────────────────────────────────────────────

export type ItemCategory = 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' | 'DISCOUNT';

export interface InvoiceItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number | Decimal;
  total: number | Decimal;
  allocatedAmount: number | Decimal;
  status: string;
  category?: ItemCategory;
}

export interface PaymentData {
  id: string;
  amount: number | Decimal;
  paymentMethod: string;
  paymentDate: Date | string;
}

export interface BookingData {
  id: string;
  serviceType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  bookingPets: { pet: { name: string; species: string; breed: string | null } }[];
}

export interface InvoiceData {
  id: string;
  version: number;
  invoiceNumber: string;
  amount: number | Decimal;
  paidAmount: number | Decimal;
  status: string;
  issuedAt: Date | string;
  paidAt: Date | string | null;
  notes: string | null;
  serviceType: string | null;
  supplementaryForBookingId: string | null;
  clientDisplayName: string | null;
  clientDisplayPhone: string | null;
  clientDisplayEmail: string | null;
  client: { id: string; name: string; email: string; phone: string | null };
  booking: BookingData | null;
  items: InvoiceItemData[];
  payments: PaymentData[];
}

export interface EditItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: ItemCategory;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: 'BOARDING', label: '🏠 Pension' },
  { value: 'PET_TAXI', label: '🚗 Pet Taxi' },
  { value: 'GROOMING', label: '✂️ Toilettage / Soins' },
  { value: 'PRODUCT',  label: '🐾 Croquettes / Produits' },
  { value: 'OTHER',    label: '➕ Autre' },
];

export const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:        { fr: 'En attente',    en: 'Pending' },
  PARTIALLY_PAID: { fr: 'Partiel',       en: 'Partial' },
  PAID:           { fr: 'Payée',         en: 'Paid' },
  CANCELLED:      { fr: 'Annulée',       en: 'Cancelled' },
};

export const METHOD_LABELS: Record<string, { fr: string; en: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash' },
  CARD:     { fr: 'Carte',    en: 'Card' },
  CHECK:    { fr: 'Chèque',   en: 'Check' },
  TRANSFER: { fr: 'Virement', en: 'Transfer' },
};

export const METHOD_ICONS: Record<string, React.ElementType> = {
  CASH:     Banknote,
  CARD:     CreditCard,
  CHECK:    Receipt,
  TRANSFER: Building2,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export const autoCategory = (desc: string): ItemCategory => {
  const d = desc.toLowerCase();
  if (d.includes('pension') || d.includes('nuit') || d.includes('hébergement')) return 'BOARDING';
  if (d.includes('taxi') || d.includes('transport') || d.includes('aller') || d.includes('retour')) return 'PET_TAXI';
  if (d.includes('toilettage') || d.includes('soin') || d.includes('médic') || d.includes('bain') || d.includes('coupe')) return 'GROOMING';
  if (d.includes('croquette') || d.includes('kibble') || d.includes('royal') || d.includes('grain') || d.includes('lamb') || d.includes('nourriture')) return 'PRODUCT';
  return 'OTHER';
};

export function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export function fmtPaymentDate(d: Date | string, locale: string): string {
  return new Date(d).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

export function getDisplayEmail(inv: { clientDisplayEmail: string | null; client: { email: string } }): string {
  if (inv.clientDisplayEmail) return inv.clientDisplayEmail;
  if (inv.client.email === 'passage@doguniverse.ma') return '';
  return inv.client.email;
}
