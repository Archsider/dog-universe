'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface BoardingDetailGrooming {
  includeGrooming: boolean;
  groomingSize: string | null;
  groomingStatus: string | null;
}

interface EditGroomingSectionProps {
  bookingId: string;
  bookingVersion: number;
  boardingDetail: BoardingDetailGrooming | null;
  locale: string;
}

// "PLANNED" | "IN_PROGRESS" | "DONE"
const GROOMING_STATUSES = ['PLANNED', 'IN_PROGRESS', 'DONE'] as const;

const l = {
  fr: {
    title: 'Toilettage',
    description: 'Activer ou désactiver le toilettage et mettre à jour son avancement.',
    enabled: 'Toilettage activé',
    disabled: 'Toilettage désactivé',
    size: 'Gabarit',
    sizeSmall: 'Petit (< 10 kg)',
    sizeLarge: 'Grand (≥ 10 kg)',
    status: 'Statut toilettage',
    statusPlanned: 'Planifié',
    statusInProgress: 'En cours',
    statusDone: 'Terminé',
    save: 'Enregistrer',
    cancel: 'Annuler',
    successMsg: 'Toilettage mis à jour.',
    errorServer: 'Erreur lors de la mise à jour.',
  },
  en: {
    title: 'Grooming',
    description: 'Enable or disable grooming and update its progress.',
    enabled: 'Grooming enabled',
    disabled: 'Grooming disabled',
    size: 'Size',
    sizeSmall: 'Small (< 10 kg)',
    sizeLarge: 'Large (≥ 10 kg)',
    status: 'Grooming status',
    statusPlanned: 'Planned',
    statusInProgress: 'In progress',
    statusDone: 'Done',
    save: 'Save',
    cancel: 'Cancel',
    successMsg: 'Grooming updated.',
    errorServer: 'Error updating grooming.',
  },
};

const STATUS_COLORS: Record<string, string> = {
  PLANNED:     'bg-amber-100 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  DONE:        'bg-green-100 text-green-700 border-green-200',
};

export default function EditGroomingSection({ bookingId, bookingVersion, boardingDetail, locale }: EditGroomingSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;

  const [open, setOpen] = useState(boardingDetail?.includeGrooming ?? false);
  const [loading, setLoading] = useState(false);

  const [enabled, setEnabled] = useState(boardingDetail?.includeGrooming ?? false);
  const [size, setSize] = useState(boardingDetail?.groomingSize ?? 'SMALL');
  const [groomStatus, setGroomStatus] = useState<string>(boardingDetail?.groomingStatus ?? 'PLANNED');

  const statusLabel = (s: string) => {
    if (s === 'PLANNED')     return t.statusPlanned;
    if (s === 'IN_PROGRESS') return t.statusInProgress;
    if (s === 'DONE')        return t.statusDone;
    return s;
  };

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patchBoardingDetail: {
            includeGrooming: enabled,
            groomingSize: enabled ? size : null,
            groomingStatus: enabled ? groomStatus : null,
          },
          version: bookingVersion,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast({
          title: locale === 'fr'
            ? 'Cette réservation a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) {
        toast({ title: data.error ?? t.errorServer, variant: 'destructive' });
        return;
      }
      toast({ title: t.successMsg });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: t.errorServer, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setOpen(false);
    setEnabled(boardingDetail?.includeGrooming ?? false);
    setSize(boardingDetail?.groomingSize ?? 'SMALL');
    setGroomStatus(boardingDetail?.groomingStatus ?? 'PLANNED');
  }

  const currentStatusColor = enabled && boardingDetail?.groomingStatus
    ? STATUS_COLORS[boardingDetail.groomingStatus] ?? ''
    : '';

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-purple-500" />
          <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
          {boardingDetail?.includeGrooming && boardingDetail.groomingStatus && (
            <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${currentStatusColor}`}>
              {statusLabel(boardingDetail.groomingStatus)}
            </span>
          )}
          {!boardingDetail?.includeGrooming && (
            <span className="text-xs text-gray-400">{t.disabled}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {/* Summary when collapsed and grooming active */}
      {!open && boardingDetail?.includeGrooming && (
        <div className="space-y-1 text-xs text-gray-600 border-t border-gray-100 pt-2">
          {boardingDetail.groomingSize && (
            <span>{boardingDetail.groomingSize === 'SMALL' ? t.sizeSmall : t.sizeLarge}</span>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-4 pt-1">
          <p className="text-xs text-gray-500">{t.description}</p>

          {/* Toggle */}
          <div className="flex items-center justify-between border border-gray-100 rounded-xl p-4">
            <span className="text-sm font-medium text-charcoal">{enabled ? t.enabled : t.disabled}</span>
            <button
              type="button"
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                enabled ? 'bg-purple-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              {/* Size */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">{t.size}</label>
                <div className="flex gap-2">
                  {(['SMALL', 'LARGE'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                        size === s
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-purple-200'
                      }`}
                    >
                      {s === 'SMALL' ? t.sizeSmall : t.sizeLarge}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">{t.status}</label>
                <div className="flex gap-2">
                  {GROOMING_STATUSES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setGroomStatus(s)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                        groomStatus === s
                          ? STATUS_COLORS[s]
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-charcoal hover:bg-charcoal/90 text-white"
              disabled={loading}
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {t.save}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={handleCancel}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
