'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  petId: string;
  petName: string;
  locale: string;
}

export default function DeleteAnimalButton({ petId, petName, locale }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const l = locale === 'en'
    ? { btn: 'Delete animal', title: 'Delete this animal?', warning: 'This will permanently delete the animal and all their records (vaccinations, documents). It will be removed from past bookings. This action cannot be undone.', cancel: 'Cancel', confirm: 'Delete permanently', success: 'Animal deleted', error: 'Error' }
    : { btn: 'Supprimer l\'animal', title: 'Supprimer cet animal ?', warning: 'Cette action supprimera définitivement l\'animal et tous ses dossiers (vaccinations, documents). Il sera retiré des réservations passées. Irréversible.', cancel: 'Annuler', confirm: 'Supprimer définitivement', success: 'Animal supprimé', error: 'Erreur' };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/animals/${petId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
      router.push(`/${locale}/admin/animals`);
    } catch {
      toast({ title: l.error, variant: 'destructive' });
      setDeleting(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        {l.btn}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-lg font-serif font-bold text-charcoal mb-1">{l.title}</h2>
            <p className="text-sm font-medium text-charcoal mb-2">{petName}</p>
            <p className="text-sm text-gray-500 mb-6">{l.warning}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 px-4 py-2 border border-ivory-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-ivory-50"
              >
                {l.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {l.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
