'use client';

// Modal de cancellation explicite pour les réservations actives.
//
// Source : audit produit 2026-05-17 — le "Forcer un statut Annulé" ne
// marchait pas car l'API exige un cancellationReason ≥ 10 chars que le
// flow inline n'envoyait pas. Cette modal force la saisie.
//
// Côté UI : champ raison textarea + checkbox "silencieux" + bandeau
// rouge d'avertissement. La cancellation cascade les TimeProposal PENDING
// → SUPERSEDED automatiquement côté serveur.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cancelBooking } from '@/lib/api-client';
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

interface Props {
  bookingId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locale: string;
}

export function CancelBookingModal({ bookingId, open, onOpenChange, locale }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [silent, setSilent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minOK = reason.trim().length >= 10;

  async function submit() {
    if (!minOK) return;
    setError(null);
    setLoading(true);
    try {
      const result = await cancelBooking(bookingId, {
        reason: reason.trim(),
        ...(silent ? { silent: true } : {}),
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      onOpenChange(false);
      setReason('');
      setSilent(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {fr ? 'Annuler cette réservation' : 'Cancel this booking'}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              {fr
                ? 'Cette action annule définitivement la réservation. Toutes les négociations d\'heure en cours seront classées sans suite.'
                : 'This permanently cancels the booking. All pending time negotiations will be voided.'}
            </span>
            <span className="block">
              <label className="block text-xs font-medium text-charcoal mb-1">
                {fr ? 'Motif de l\'annulation' : 'Cancellation reason'} <span className="text-red-600">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={fr
                  ? 'Ex : client a appelé pour annuler, déménagement…'
                  : 'E.g. client called to cancel, moving out…'}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <span className={`block text-[10px] mt-1 ${minOK ? 'text-emerald-600' : 'text-gray-500'}`}>
                {fr
                  ? `${reason.trim().length} / 10 caractères minimum`
                  : `${reason.trim().length} / 10 chars minimum`}
              </span>
            </span>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={silent}
                onChange={(e) => setSilent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {fr
                  ? 'Annulation silencieuse (ne pas notifier le client) — usage rare, ex: doublon ou nettoyage data'
                  : 'Silent cancel (don\'t notify client) — rare, e.g. duplicate or data cleanup'}
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
          <AlertDialogCancel disabled={loading} onClick={() => { setReason(''); setSilent(false); setError(null); }}>
            <X className="h-4 w-4 mr-1" />
            {fr ? 'Retour' : 'Back'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void submit(); }}
            disabled={loading || !minOK}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {fr ? 'Annuler la réservation' : 'Cancel the booking'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
