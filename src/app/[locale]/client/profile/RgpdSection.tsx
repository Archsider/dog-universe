'use client';

// RGPD section embedded at the bottom of /client/profile.
// - Export : GET /api/user/export, downloads JSON via blob URL.
// - Anonymize : POST /api/user/anonymize with password confirmation,
//   on success calls signOut() because tokenVersion has bumped.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Download, Trash2, Loader2, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

interface Props { locale: string }

const L = {
  fr: {
    title: 'Mes données personnelles',
    legal:
      'Conformément à la loi 09-08 (Maroc) et au RGPD, vous pouvez télécharger l\'ensemble de vos données ou demander la suppression de votre compte.',
    download: 'Télécharger mes données',
    downloading: 'Préparation du fichier…',
    downloadSuccess: 'Téléchargement lancé.',
    delete: 'Supprimer mon compte',
    deleting: 'Suppression…',
    rateLimited: 'Limite quotidienne atteinte (3 exports/jour). Réessayez demain.',
    activeBooking:
      'Suppression impossible : vous avez une réservation en cours ou à venir. Contactez-nous d\'abord.',
    confirmTitle: 'Supprimer définitivement votre compte ?',
    confirmText:
      'Cette action est irréversible. Vos animaux et notifications seront supprimés ; vos factures restent conservées pour des raisons comptables. Vous serez déconnecté immédiatement.',
    passwordLabel: 'Confirmez votre mot de passe',
    passwordPh: 'Mot de passe actuel',
    cancel: 'Annuler',
    confirmBtn: 'Supprimer mon compte',
    invalidPassword: 'Mot de passe incorrect.',
    success: 'Compte supprimé.',
    error: 'Erreur — réessayez.',
  },
  en: {
    title: 'My personal data',
    legal:
      'Under Morocco\'s 09-08 law and the GDPR, you may download all your data or request account deletion.',
    download: 'Download my data',
    downloading: 'Preparing file…',
    downloadSuccess: 'Download started.',
    delete: 'Delete my account',
    deleting: 'Deleting…',
    rateLimited: 'Daily limit reached (3 exports/day). Try again tomorrow.',
    activeBooking:
      'Deletion blocked: you have an active or upcoming booking. Please contact us first.',
    confirmTitle: 'Permanently delete your account?',
    confirmText:
      'This action is irreversible. Your pets and notifications will be deleted; invoices are kept for accounting reasons. You will be logged out immediately.',
    passwordLabel: 'Confirm your password',
    passwordPh: 'Current password',
    cancel: 'Cancel',
    confirmBtn: 'Delete my account',
    invalidPassword: 'Wrong password.',
    success: 'Account deleted.',
    error: 'Error — please retry.',
  },
};

export default function RgpdSection({ locale }: Props) {
  const router = useRouter();
  const t = L[locale as 'fr' | 'en'] ?? L.fr;
  const [exporting, setExporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/user/export');
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
      a.download = fnameMatch?.[1] ?? `doguniverse-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t.downloadSuccess });
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!password) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/user/anonymize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'INVALID_PASSWORD') toast({ title: t.invalidPassword, variant: 'destructive' });
        else if (data.error === 'ACTIVE_BOOKING_EXISTS') toast({ title: t.activeBooking, variant: 'destructive' });
        else toast({ title: t.error, variant: 'destructive' });
        return;
      }
      toast({ title: t.success });
      // tokenVersion bumped — current session is dead. Sign out client-side.
      await signOut({ redirect: false });
      router.replace(`/${locale}/auth/login`);
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setPassword('');
      setShowConfirm(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-200/60 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="h-4 w-4 text-red-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">{t.legal}</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="flex-1"
        >
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          {exporting ? t.downloading : t.download}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowConfirm(true)}
          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t.delete}
        </Button>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-serif font-bold text-charcoal pr-6">{t.confirmTitle}</h2>
              <button
                className="text-gray-400 hover:text-charcoal"
                onClick={() => !deleting && setShowConfirm(false)}
                disabled={deleting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{t.confirmText}</p>
            <div>
              <Label htmlFor="rgpd-pw" className="text-xs text-gray-600">{t.passwordLabel}</Label>
              <Input
                id="rgpd-pw"
                type="password"
                placeholder={t.passwordPh}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={deleting}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={deleting}>
                {t.cancel}
              </Button>
              <Button
                onClick={handleConfirmDelete}
                disabled={deleting || !password}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {deleting ? t.deleting : t.confirmBtn}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
