'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car, ChevronDown, ChevronUp, Save, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface BoardingDetailTaxi {
  taxiGoEnabled: boolean;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiGoAddress: string | null;
  taxiGoStatus: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiReturnAddress: string | null;
  taxiReturnStatus: string | null;
}

const TAXI_NEXT_STATUS: Record<string, string> = {
  PENDING:     'CONFIRMED',
  CONFIRMED:   'AT_PICKUP',
  AT_PICKUP:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const TAXI_STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:     { fr: 'Transport planifié',               en: 'Transport planned' },
  CONFIRMED:   { fr: 'En route vers le point de départ', en: 'En route to pickup' },
  AT_PICKUP:   { fr: 'Sur place',                        en: 'On site' },
  IN_PROGRESS: { fr: 'Animal à bord',                    en: 'Pet on board' },
  COMPLETED:   { fr: 'Arrivé à destination',             en: 'Arrived at destination' },
};

interface EditTaxiAddonSectionProps {
  bookingId: string;
  boardingDetail: BoardingDetailTaxi | null;
  locale: string;
}

const l = {
  fr: {
    title: 'Add-ons Pet Taxi',
    description: 'Gérer les trajets taxi liés à ce séjour (aller à la pension / retour à domicile).',
    goSection: 'Taxi aller (dépôt à la pension)',
    returnSection: 'Taxi retour (récupération au domicile)',
    enabled: 'Activé',
    disabled: 'Désactivé',
    date: 'Date',
    time: 'Heure',
    address: 'Adresse',
    addressPlaceholder: 'Adresse de prise en charge',
    save: 'Enregistrer',
    cancel: 'Annuler',
    successMsg: 'Add-ons taxi mis à jour.',
    errorServer: 'Erreur lors de la mise à jour.',
    timePlaceholder: 'ex: 10:00',
  },
  en: {
    title: 'Pet Taxi Add-ons',
    description: 'Manage taxi trips linked to this stay (drop-off at facility / pick-up at home).',
    goSection: 'Taxi go (drop-off at facility)',
    returnSection: 'Taxi return (pick-up at home)',
    enabled: 'Enabled',
    disabled: 'Disabled',
    date: 'Date',
    time: 'Time',
    address: 'Address',
    addressPlaceholder: 'Pick-up address',
    save: 'Save',
    cancel: 'Cancel',
    successMsg: 'Taxi add-ons updated.',
    errorServer: 'Error updating taxi add-ons.',
    timePlaceholder: 'e.g. 10:00',
  },
};

export default function EditTaxiAddonSection({ bookingId, boardingDetail, locale }: EditTaxiAddonSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const isFr = locale !== 'en';
  const hasAnyTaxi = !!(boardingDetail?.taxiGoEnabled || boardingDetail?.taxiReturnEnabled);
  const [open, setOpen] = useState(hasAnyTaxi);
  const [loading, setLoading] = useState(false);

  // Taxi go state
  const [goEnabled, setGoEnabled] = useState(boardingDetail?.taxiGoEnabled ?? false);
  const [goDate, setGoDate] = useState(boardingDetail?.taxiGoDate ?? '');
  const [goTime, setGoTime] = useState(boardingDetail?.taxiGoTime ?? '');
  const [goAddress, setGoAddress] = useState(boardingDetail?.taxiGoAddress ?? '');
  const [goStatus, setGoStatus] = useState(boardingDetail?.taxiGoStatus ?? 'PENDING');
  const [loadingGoStatus, setLoadingGoStatus] = useState(false);

  // Taxi return state
  const [returnEnabled, setReturnEnabled] = useState(boardingDetail?.taxiReturnEnabled ?? false);
  const [returnDate, setReturnDate] = useState(boardingDetail?.taxiReturnDate ?? '');
  const [returnTime, setReturnTime] = useState(boardingDetail?.taxiReturnTime ?? '');
  const [returnAddress, setReturnAddress] = useState(boardingDetail?.taxiReturnAddress ?? '');
  const [returnStatus, setReturnStatus] = useState(boardingDetail?.taxiReturnStatus ?? 'PENDING');
  const [loadingReturnStatus, setLoadingReturnStatus] = useState(false);

  async function advanceTaxiStatus(
    field: 'taxiGoStatus' | 'taxiReturnStatus',
    currentStatus: string,
    setLoadingFn: (v: boolean) => void,
    setStatusFn: (s: string) => void,
  ) {
    const next = TAXI_NEXT_STATUS[currentStatus];
    if (!next) return;
    setLoadingFn(true);
    try {
      const res = await fetch(`/api/reservations/${bookingId}/taxi-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, nextStatus: next }),
      });
      if (!res.ok) throw new Error();
      setStatusFn(next);
    } catch {
      toast({ title: t.errorServer, variant: 'destructive' });
    } finally {
      setLoadingFn(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patchBoardingDetail: {
            taxiGoEnabled: goEnabled,
            taxiGoDate: goEnabled && goDate ? goDate : null,
            taxiGoTime: goEnabled && goTime ? goTime : null,
            taxiGoAddress: goEnabled && goAddress ? goAddress : null,
            taxiReturnEnabled: returnEnabled,
            taxiReturnDate: returnEnabled && returnDate ? returnDate : null,
            taxiReturnTime: returnEnabled && returnTime ? returnTime : null,
            taxiReturnAddress: returnEnabled && returnAddress ? returnAddress : null,
          },
        }),
      });
      const data = await res.json();
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
    setGoEnabled(boardingDetail?.taxiGoEnabled ?? false);
    setGoDate(boardingDetail?.taxiGoDate ?? '');
    setGoTime(boardingDetail?.taxiGoTime ?? '');
    setGoAddress(boardingDetail?.taxiGoAddress ?? '');
    setReturnEnabled(boardingDetail?.taxiReturnEnabled ?? false);
    setReturnDate(boardingDetail?.taxiReturnDate ?? '');
    setReturnTime(boardingDetail?.taxiReturnTime ?? '');
    setReturnAddress(boardingDetail?.taxiReturnAddress ?? '');
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-orange-500" />
          <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
          {hasAnyTaxi && (
            <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
              {[boardingDetail?.taxiGoEnabled && 'aller', boardingDetail?.taxiReturnEnabled && 'retour'].filter(Boolean).join(' + ')}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {/* Summary visible when collapsed and taxi is active */}
      {!open && hasAnyTaxi && (
        <div className="space-y-3 text-xs text-gray-600 border-t border-gray-100 pt-2">
          {boardingDetail?.taxiGoEnabled && (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-orange-700">↗ Aller (dépôt pension)</span>
              {boardingDetail.taxiGoDate && <span>{boardingDetail.taxiGoDate}{boardingDetail.taxiGoTime ? ` — ${boardingDetail.taxiGoTime}` : ''}</span>}
              {boardingDetail.taxiGoAddress && <span className="text-gray-500 italic">{boardingDetail.taxiGoAddress}</span>}
              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-orange-100">
                <span className="font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                  {TAXI_STATUS_LABELS[goStatus] ? (isFr ? TAXI_STATUS_LABELS[goStatus].fr : TAXI_STATUS_LABELS[goStatus].en) : goStatus}
                </span>
                {TAXI_NEXT_STATUS[goStatus] && (
                  <button
                    type="button"
                    onClick={() => advanceTaxiStatus('taxiGoStatus', goStatus, setLoadingGoStatus, setGoStatus)}
                    disabled={loadingGoStatus}
                    className="flex items-center gap-1 font-medium text-charcoal border border-charcoal/20 hover:border-charcoal/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    {loadingGoStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                    {(() => { const nl = TAXI_STATUS_LABELS[TAXI_NEXT_STATUS[goStatus]]; return nl ? (isFr ? nl.fr : nl.en) : TAXI_NEXT_STATUS[goStatus]; })()}
                  </button>
                )}
              </div>
            </div>
          )}
          {boardingDetail?.taxiReturnEnabled && (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-orange-700">↙ Retour (domicile)</span>
              {boardingDetail.taxiReturnDate && <span>{boardingDetail.taxiReturnDate}{boardingDetail.taxiReturnTime ? ` — ${boardingDetail.taxiReturnTime}` : ''}</span>}
              {boardingDetail.taxiReturnAddress && <span className="text-gray-500 italic">{boardingDetail.taxiReturnAddress}</span>}
              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-orange-100">
                <span className="font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                  {TAXI_STATUS_LABELS[returnStatus] ? (isFr ? TAXI_STATUS_LABELS[returnStatus].fr : TAXI_STATUS_LABELS[returnStatus].en) : returnStatus}
                </span>
                {TAXI_NEXT_STATUS[returnStatus] && (
                  <button
                    type="button"
                    onClick={() => advanceTaxiStatus('taxiReturnStatus', returnStatus, setLoadingReturnStatus, setReturnStatus)}
                    disabled={loadingReturnStatus}
                    className="flex items-center gap-1 font-medium text-charcoal border border-charcoal/20 hover:border-charcoal/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    {loadingReturnStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                    {(() => { const nl = TAXI_STATUS_LABELS[TAXI_NEXT_STATUS[returnStatus]]; return nl ? (isFr ? nl.fr : nl.en) : TAXI_NEXT_STATUS[returnStatus]; })()}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-5 pt-1">
          <p className="text-xs text-gray-500">{t.description}</p>

          {/* Taxi Aller */}
          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-charcoal">{t.goSection}</span>
              <button
                type="button"
                onClick={() => setGoEnabled(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  goEnabled ? 'bg-orange-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    goEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {goEnabled && (
              <>
                <div className="flex items-center justify-between gap-2 py-2 border-t border-b border-orange-100">
                  <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                    {TAXI_STATUS_LABELS[goStatus] ? (isFr ? TAXI_STATUS_LABELS[goStatus].fr : TAXI_STATUS_LABELS[goStatus].en) : goStatus}
                  </span>
                  {TAXI_NEXT_STATUS[goStatus] && (
                    <button
                      type="button"
                      onClick={() => advanceTaxiStatus('taxiGoStatus', goStatus, setLoadingGoStatus, setGoStatus)}
                      disabled={loadingGoStatus}
                      className="flex items-center gap-1 text-xs font-medium text-charcoal border border-charcoal/20 hover:border-charcoal/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                    >
                      {loadingGoStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      {(() => { const nl = TAXI_STATUS_LABELS[TAXI_NEXT_STATUS[goStatus]]; return nl ? (isFr ? nl.fr : nl.en) : TAXI_NEXT_STATUS[goStatus]; })()}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.date}</label>
                    <input
                      type="date"
                      value={goDate}
                      onChange={e => setGoDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.time}</label>
                    <input
                      type="time"
                      value={goTime}
                      min="10:00"
                      max="17:00"
                      onChange={e => setGoTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.address}</label>
                    <input
                      type="text"
                      value={goAddress}
                      onChange={e => setGoAddress(e.target.value)}
                      placeholder={t.addressPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Taxi Retour */}
          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-charcoal">{t.returnSection}</span>
              <button
                type="button"
                onClick={() => setReturnEnabled(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  returnEnabled ? 'bg-orange-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    returnEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {returnEnabled && (
              <>
                <div className="flex items-center justify-between gap-2 py-2 border-t border-b border-orange-100">
                  <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                    {TAXI_STATUS_LABELS[returnStatus] ? (isFr ? TAXI_STATUS_LABELS[returnStatus].fr : TAXI_STATUS_LABELS[returnStatus].en) : returnStatus}
                  </span>
                  {TAXI_NEXT_STATUS[returnStatus] && (
                    <button
                      type="button"
                      onClick={() => advanceTaxiStatus('taxiReturnStatus', returnStatus, setLoadingReturnStatus, setReturnStatus)}
                      disabled={loadingReturnStatus}
                      className="flex items-center gap-1 text-xs font-medium text-charcoal border border-charcoal/20 hover:border-charcoal/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                    >
                      {loadingReturnStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      {(() => { const nl = TAXI_STATUS_LABELS[TAXI_NEXT_STATUS[returnStatus]]; return nl ? (isFr ? nl.fr : nl.en) : TAXI_NEXT_STATUS[returnStatus]; })()}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.date}</label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.time}</label>
                    <input
                      type="time"
                      value={returnTime}
                      min="10:00"
                      max="17:00"
                      onChange={e => setReturnTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.address}</label>
                    <input
                      type="text"
                      value={returnAddress}
                      onChange={e => setReturnAddress(e.target.value)}
                      placeholder={t.addressPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

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
