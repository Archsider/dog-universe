'use client';

// Modal d'annulation explicite d'une facture (principale ou supplément).
//
// Source : audit produit 2026-05-17 — il manquait un moyen UI propre
// d'annuler une facture fantôme (cas Marie Lagarde DU-2026-0052 :
// croquettes 740 MAD doublonnées). Pattern symétrique avec
// CancelBookingModal (raison ≥ 10 chars, silent option, refund opt-in
// si paid > 0).
//
// Garde-fous :
//  - Champ raison textarea avec compteur live ≥ 10 chars
//  - Si invoice payée (paidAmount > 0) : panneau refund obligatoire
//    avec radio Espèces/Carte/Chèque/Virement
//  - Checkbox silencieux (skip notification client) pour data-cleanup
//  - Toast d'erreur surface le code serveur (debug future-proof)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { cancelInvoice } from '@/lib/api-client';
import type { CancelInvoiceBody, RefundPaymentMethod } from '@/lib/api-schemas/cancel-invoice';

type PaymentMethod = RefundPaymentMethod;

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locale: string;
}

const METHOD_LABELS: Record<PaymentMethod, { fr: string; en: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash' },
  CARD:     { fr: 'Carte',    en: 'Card' },
  CHECK:    { fr: 'Chèque',   en: 'Check' },
  TRANSFER: { fr: 'Virement', en: 'Transfer' },
};

export function CancelInvoiceModal({
  invoiceId, invoiceNumber, amount, paidAmount, open, onOpenChange, locale,
}: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [silent, setSilent] = useState(false);
  const [refundExisting, setRefundExisting] = useState(false);
  const [paymentMethodForRefund, setPaymentMethodForRefund] = useState<PaymentMethod>('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaid = paidAmount > 0;
  const reasonOK = reason.trim().length >= 10;
  // For paid invoices, the operator MUST tick refundExisting before submitting.
  const refundOK = !isPaid || refundExisting;
  const canSubmit = reasonOK && refundOK && !loading;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const body: CancelInvoiceBody = {
        reason: reason.trim(),
        ...(silent ? { silent: true } : {}),
        ...(isPaid
          ? { refundExisting: true, paymentMethodForRefund }
          : {}),
      };
      const result = await cancelInvoice(invoiceId, body);
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      onOpenChange(false);
      setReason('');
      setSilent(false);
      setRefundExisting(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  function fmt(n: number): string {
    return new Intl.NumberFormat(fr ? 'fr-FR' : 'en-US', { maximumFractionDigits: 2 }).format(n);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {fr ? 'Annuler la facture ' : 'Cancel invoice '}
            <code className="text-sm">{invoiceNumber}</code>
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              {fr
                ? `Montant : ${fmt(amount)} MAD${isPaid ? ` · Payée : ${fmt(paidAmount)} MAD` : ' · Non payée'}.`
                : `Amount: ${fmt(amount)} MAD${isPaid ? ` · Paid: ${fmt(paidAmount)} MAD` : ' · Unpaid'}.`}
            </span>
            <span className="block">
              {fr
                ? "Cette action passe le statut de la facture à ANNULÉE et délie les éventuels BookingItem qui y étaient rattachés (ils redeviennent non-facturés)."
                : 'This sets the invoice status to CANCELLED and unlinks any BookingItems that pointed at it (they become unbilled again).'}
            </span>

            <span className="block">
              <label className="block text-xs font-medium text-charcoal mb-1">
                {fr ? "Motif de l'annulation" : 'Cancellation reason'} <span className="text-red-600">*</span>
              </label>
              <textarea
                data-testid="cancel-invoice-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={fr
                  ? "Ex : doublon avec la facture principale, les croquettes y sont déjà…"
                  : 'E.g. duplicate of the main invoice, products already billed there…'}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <span className={`block text-[10px] mt-1 ${reasonOK ? 'text-emerald-600' : 'text-gray-500'}`}>
                {fr
                  ? `${reason.trim().length} / 10 caractères minimum`
                  : `${reason.trim().length} / 10 chars minimum`}
              </span>
            </span>

            {isPaid && (
              <span className="block rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <span className="block text-xs font-medium text-amber-900">
                  ⚠️ {fr
                    ? `Cette facture a ${fmt(paidAmount)} MAD déjà encaissés. Confirmer le remboursement :`
                    : `This invoice has ${fmt(paidAmount)} MAD already collected. Confirm refund:`}
                </span>
                <label className="flex items-start gap-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    data-testid="cancel-invoice-refund"
                    checked={refundExisting}
                    onChange={(e) => setRefundExisting(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {fr
                      ? `Je confirme rembourser ${fmt(paidAmount)} MAD au client`
                      : `I confirm refunding ${fmt(paidAmount)} MAD to the client`}
                  </span>
                </label>
                {refundExisting && (
                  <span className="block">
                    <span className="block text-[10px] font-medium text-amber-900 mb-1">
                      {fr ? 'Mode de remboursement' : 'Refund method'}
                    </span>
                    <span className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentMethodForRefund(m)}
                          className={`px-2 py-1 rounded border text-xs ${
                            paymentMethodForRefund === m
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'bg-white border-amber-300 text-amber-900'
                          }`}
                        >
                          {fr ? METHOD_LABELS[m].fr : METHOD_LABELS[m].en}
                        </button>
                      ))}
                    </span>
                  </span>
                )}
              </span>
            )}

            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={silent}
                onChange={(e) => setSilent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {fr
                  ? "Annulation silencieuse (ne pas notifier le client) — pour les cas de cleanup data uniquement"
                  : "Silent cancel (don't notify client) — for data-cleanup cases only"}
              </span>
            </label>

            {error && (
              <span className="block bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                {fr ? 'Erreur :' : 'Error:'} <strong>{error}</strong>
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            onClick={() => {
              setReason('');
              setSilent(false);
              setRefundExisting(false);
              setError(null);
            }}
          >
            <X className="h-4 w-4 mr-1" />
            {fr ? 'Retour' : 'Back'}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="cancel-invoice-confirm"
            onClick={(e) => { e.preventDefault(); void submit(); }}
            disabled={!canSubmit}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {fr ? 'Annuler la facture' : 'Cancel the invoice'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
