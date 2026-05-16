'use client';

// Petit wrapper client : bouton "Annuler la facture" rouge + modal.
// Permet d'insérer la fonctionnalité dans une Server Component
// (BookingInvoiceSection) sans la convertir en client.
//
// Source : audit produit 2026-05-17 (cas Marie Lagarde DU-2026-0052).

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { CancelInvoiceModal } from './CancelInvoiceModal';

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  status: string;
  locale: string;
}

export function InvoiceCancelButton({
  invoiceId, invoiceNumber, amount, paidAmount, status, locale,
}: Props) {
  const [open, setOpen] = useState(false);
  const fr = locale === 'fr';

  // No cancel button for already-cancelled invoices.
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <Ban className="h-3 w-3" />
        {fr ? 'Annulée' : 'Cancelled'}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200"
        title={fr ? "Annuler cette facture" : 'Cancel this invoice'}
      >
        <Ban className="h-3 w-3" />
        {fr ? 'Annuler' : 'Cancel'}
      </button>
      <CancelInvoiceModal
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        amount={amount}
        paidAmount={paidAmount}
        open={open}
        onOpenChange={setOpen}
        locale={locale}
      />
    </>
  );
}
