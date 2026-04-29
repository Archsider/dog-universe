'use client';

// SUPERADMIN-only RGPD actions on a client account.
// - Export : downloads the same JSON the client would get for themselves.
// - Anonymize : hard wipe of identifiable PII (irreversible).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2, Loader2, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  clientName: string;
  alreadyAnonymized: boolean;
  locale: string;
}

const L = {
  fr: {
    title: 'Actions RGPD',
    subtitle: 'Réservé SUPERADMIN — actions sensibles, audit-loggées.',
    export: 'Exporter les données',
    exporting: 'Export…',
    anonymize: 'Anonymiser le compte',
    anonymizing: 'Anonymisation…',
    alreadyAnonymized: 'Compte déjà anonymisé',
    confirmTitle: 'Anonymiser ce compte ?',
    confirmText: (name: string) =>
      `Vous allez supprimer définitivement les données personnelles de ${name}. Les réservations et factures restent intactes pour la comptabilité. Action irréversible.`,
    cancel: 'Annuler',
    confirmBtn: 'Anonymiser',
    activeBooking: 'Bloqué : ce client a une réservation active.',
    rateLimited: 'Limite quotidienne (3/jour) atteinte pour cet utilisateur.',
    success: 'Compte anonymisé.',
    error: 'Erreur.',
    exportSuccess: 'Téléchargement lancé.',
  },
  en: {
    title: 'GDPR actions',
    subtitle: 'SUPERADMIN-only — sensitive, audit-logged.',
    export: 'Export data',
    exporting: 'Exporting…',
    anonymize: 'Anonymize account',
    anonymizing: 'Anonymizing…',
    alreadyAnonymized: 'Account already anonymized',
    confirmTitle: 'Anonymize this account?',
    confirmText: (name: string) =>
      `You are about to permanently erase ${name}'s personal data. Bookings and invoices stay intact for accounting. This is irreversible.`,
    cancel: 'Cancel',
    confirmBtn: 'Anonymize',
    activeBooking: 'Blocked: this client has an active booking.',
    rateLimited: 'Daily limit (3/day) reached for this user.',
    success: 'Account anonymized.',
    error: 'Error.',
    exportSuccess: 'Download started.',
  },
};

export default function RgpdAdminSection({ clientId, clientName, alreadyAnonymized, locale }: Props) {
  const router = useRouter();
  const t = L[locale as 'fr' | 'en'] ?? L.fr;
  const [exporting, setExporting] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/user/export?userId=${encodeURIComponent(clientId)}`);
      if (res.status === 429) {
        toast({ title: t.rateLimited, variant: 'destructive' });
        return;
      }
      if (!res.ok) {
        toast({ title: t.error, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const fnameMatch = /filename="([^"]+)"/.exec(cd);
      a.download = fnameMatch?.[1] ?? `doguniverse-export-${clientId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t.exportSuccess });
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleConfirmAnonymize() {
    setAnonymizing(true);
    try {
      const res = await fetch('/api/user/anonymize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'ACTIVE_BOOKING_EXISTS') toast({ title: t.activeBooking, variant: 'destructive' });
        else toast({ title: data.error ?? t.error, variant: 'destructive' });
        return;
      }
      toast({ title: t.success });
      setShowConfirm(false);
      router.refresh();
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setAnonymizing(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-200/60 p-4 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="h-4 w-4 text-red-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">{t.subtitle}</p>

      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          {exporting ? t.exporting : t.export}
        </Button>
        {alreadyAnonymized ? (
          <p className="text-xs text-gray-400 italic text-center py-1">{t.alreadyAnonymized}</p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(true)}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t.anonymize}
          </Button>
        )}
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !anonymizing && setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-serif font-bold text-charcoal pr-6">{t.confirmTitle}</h2>
              <button
                className="text-gray-400 hover:text-charcoal"
                onClick={() => !anonymizing && setShowConfirm(false)}
                disabled={anonymizing}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{t.confirmText(clientName)}</p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={anonymizing}>
                {t.cancel}
              </Button>
              <Button
                onClick={handleConfirmAnonymize}
                disabled={anonymizing}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {anonymizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {anonymizing ? t.anonymizing : t.confirmBtn}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
