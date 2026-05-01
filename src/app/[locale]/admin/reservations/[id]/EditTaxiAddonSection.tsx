'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';
import TaxiTrackingButton from '@/components/admin/TaxiTrackingButton';

interface BoardingDetailTaxi {
  taxiGoEnabled: boolean;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiGoAddress: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiReturnAddress: string | null;
}

interface EditTaxiAddonSectionProps {
  bookingId: string;
  bookingVersion: number;
  boardingDetail: BoardingDetailTaxi | null;
  goTrip: TaxiTripData | null;
  returnTrip: TaxiTripData | null;
  // Tracking GPS metadata (passée séparément car non incluse dans TaxiTripData)
  goTracking?: { trackingActive: boolean; trackingToken: string | null } | null;
  returnTracking?: { trackingActive: boolean; trackingToken: string | null } | null;
  locale: string;
}

const l = {
  fr: {
    title: 'Add-ons Pet Taxi',
    description: 'Gérer les trajets taxi liés à ce séjour (aller à la pension / retour à domicile).',
    goSection: 'Taxi aller (dépôt à la pension)',
    returnSection: 'Taxi retour (récupération au domicile)',
    date: 'Date',
    time: 'Heure',
    address: 'Adresse',
    addressPlaceholder: 'Adresse de prise en charge',
    save: 'Enregistrer',
    cancel: 'Annuler',
    successMsg: 'Add-ons taxi mis à jour.',
    errorServer: 'Erreur lors de la mise à jour.',
    noTrip: 'Enregistrez d\'abord pour activer le suivi.',
  },
  en: {
    title: 'Pet Taxi Add-ons',
    description: 'Manage taxi trips linked to this stay (drop-off at facility / pick-up at home).',
    goSection: 'Taxi go (drop-off at facility)',
    returnSection: 'Taxi return (pick-up at home)',
    date: 'Date',
    time: 'Time',
    address: 'Address',
    addressPlaceholder: 'Pick-up address',
    save: 'Save',
    cancel: 'Cancel',
    successMsg: 'Taxi add-ons updated.',
    errorServer: 'Error updating taxi add-ons.',
    noTrip: 'Save first to activate tracking.',
  },
};

export default function EditTaxiAddonSection({
  bookingId, bookingVersion, boardingDetail, goTrip, returnTrip, goTracking, returnTracking, locale,
}: EditTaxiAddonSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const hasAnyTaxi = !!(boardingDetail?.taxiGoEnabled || boardingDetail?.taxiReturnEnabled);
  const [open, setOpen] = useState(hasAnyTaxi);
  const [loading, setLoading] = useState(false);

  const [goEnabled, setGoEnabled]         = useState(boardingDetail?.taxiGoEnabled ?? false);
  const [goDate, setGoDate]               = useState(boardingDetail?.taxiGoDate ?? '');
  const [goTime, setGoTime]               = useState(boardingDetail?.taxiGoTime ?? '');
  const [goAddress, setGoAddress]         = useState(boardingDetail?.taxiGoAddress ?? '');

  const [returnEnabled, setReturnEnabled]   = useState(boardingDetail?.taxiReturnEnabled ?? false);
  const [returnDate, setReturnDate]         = useState(boardingDetail?.taxiReturnDate ?? '');
  const [returnTime, setReturnTime]         = useState(boardingDetail?.taxiReturnTime ?? '');
  const [returnAddress, setReturnAddress]   = useState(boardingDetail?.taxiReturnAddress ?? '');

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patchBoardingDetail: {
            taxiGoEnabled: goEnabled,
            taxiGoDate:    goEnabled && goDate    ? goDate    : null,
            taxiGoTime:    goEnabled && goTime    ? goTime    : null,
            taxiGoAddress: goEnabled && goAddress ? goAddress : null,
            taxiReturnEnabled: returnEnabled,
            taxiReturnDate:    returnEnabled && returnDate    ? returnDate    : null,
            taxiReturnTime:    returnEnabled && returnTime    ? returnTime    : null,
            taxiReturnAddress: returnEnabled && returnAddress ? returnAddress : null,
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

      {/* Collapsed summary — show timelines */}
      {!open && hasAnyTaxi && (
        <div className="space-y-4 border-t border-gray-100 pt-3">
          {boardingDetail?.taxiGoEnabled && (
            <div>
              <p className="text-xs font-semibold text-orange-700 mb-2">↗ Aller (dépôt pension)</p>
              {goTrip
                ? <>
                    <TaxiTimeline trip={goTrip} locale={locale} />
                    {goTracking && (
                      <TaxiTrackingButton
                        taxiTripId={goTrip.id}
                        tripType={goTrip.tripType}
                        status={goTrip.status}
                        trackingActive={goTracking.trackingActive}
                        trackingToken={goTracking.trackingToken}
                        locale={locale}
                      />
                    )}
                  </>
                : <p className="text-xs text-gray-400 italic">{t.noTrip}</p>}
            </div>
          )}
          {boardingDetail?.taxiReturnEnabled && (
            <div>
              <p className="text-xs font-semibold text-orange-700 mb-2">↙ Retour (domicile)</p>
              {returnTrip
                ? <>
                    <TaxiTimeline trip={returnTrip} locale={locale} />
                    {returnTracking && (
                      <TaxiTrackingButton
                        taxiTripId={returnTrip.id}
                        tripType={returnTrip.tripType}
                        status={returnTrip.status}
                        trackingActive={returnTracking.trackingActive}
                        trackingToken={returnTracking.trackingToken}
                        locale={locale}
                      />
                    )}
                  </>
                : <p className="text-xs text-gray-400 italic">{t.noTrip}</p>}
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
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  goEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {goEnabled && (
              <>
                {/* Timeline (if trip exists) */}
                {goTrip && (
                  <div className="border-t border-gray-100 pt-3">
                    <TaxiTimeline trip={goTrip} locale={locale} />
                    {goTracking && (
                      <TaxiTrackingButton
                        taxiTripId={goTrip.id}
                        tripType={goTrip.tripType}
                        status={goTrip.status}
                        trackingActive={goTracking.trackingActive}
                        trackingToken={goTracking.trackingToken}
                        locale={locale}
                      />
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.date}</label>
                    <input type="date" value={goDate} onChange={e => setGoDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.time}</label>
                    <input type="time" value={goTime} min="10:00" max="17:00" onChange={e => setGoTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.address}</label>
                    <input type="text" value={goAddress} onChange={e => setGoAddress(e.target.value)}
                      placeholder={t.addressPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
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
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  returnEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {returnEnabled && (
              <>
                {returnTrip && (
                  <div className="border-t border-gray-100 pt-3">
                    <TaxiTimeline trip={returnTrip} locale={locale} />
                    {returnTracking && (
                      <TaxiTrackingButton
                        taxiTripId={returnTrip.id}
                        tripType={returnTrip.tripType}
                        status={returnTrip.status}
                        trackingActive={returnTracking.trackingActive}
                        trackingToken={returnTracking.trackingToken}
                        locale={locale}
                      />
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.date}</label>
                    <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.time}</label>
                    <input type="time" value={returnTime} min="10:00" max="17:00" onChange={e => setReturnTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">{t.address}</label>
                    <input type="text" value={returnAddress} onChange={e => setReturnAddress(e.target.value)}
                      placeholder={t.addressPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="bg-charcoal hover:bg-charcoal/90 text-white" disabled={loading} onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {t.save}
            </Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={handleCancel}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
