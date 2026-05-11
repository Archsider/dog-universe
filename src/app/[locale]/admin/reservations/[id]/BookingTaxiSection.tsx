import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';
import TaxiTrackingButton from '@/components/admin/TaxiTrackingButton';
import { TaxiNavBlock } from '@/components/admin/TaxiNavigationButton';
import TaxiHeartbeatIndicator from './TaxiHeartbeatIndicator';
import AdminTaxiLiveMap from './AdminTaxiLiveMap';
import AdminTaxiReplay from './AdminTaxiReplay';

interface TaxiDetailProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupAddress?: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffAddress?: string | null;
}

interface RawTaxiTrip {
  id: string;
  tripType: string;
  status: string;
  trackingActive: boolean;
  trackingToken: string | null;
  distanceKm: number;
}

interface BookingTaxiSectionProps {
  bookingId: string;
  bookingStatus: string;
  taxiDetail: TaxiDetailProps;
  standaloneTrip: TaxiTripData | null;
  rawStandaloneTrip: RawTaxiTrip | null;
  locale: string;
}

export default function BookingTaxiSection({
  bookingId,
  bookingStatus,
  taxiDetail,
  standaloneTrip,
  rawStandaloneTrip,
  locale,
}: BookingTaxiSectionProps) {
  return (
    <>
      {/* PET_TAXI navigation — pickup + dropoff (driver helper) */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
        <div>
          <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2 mb-3">
            <span className="text-base">📍</span>
            {locale === 'fr' ? 'Localisation pickup' : 'Pickup location'}
          </h3>
          <TaxiNavBlock
            lat={taxiDetail.pickupLat}
            lng={taxiDetail.pickupLng}
            address={taxiDetail.pickupAddress}
            locale={locale === 'en' ? 'en' : 'fr'}
          />
        </div>
        {(taxiDetail.dropoffLat || taxiDetail.dropoffLng || taxiDetail.dropoffAddress) && (
          <div className="pt-4 border-t border-ivory-100">
            <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2 mb-3">
              <span className="text-base">📍</span>
              {locale === 'fr' ? 'Localisation dropoff' : 'Dropoff location'}
            </h3>
            <TaxiNavBlock
              lat={taxiDetail.dropoffLat}
              lng={taxiDetail.dropoffLng}
              address={taxiDetail.dropoffAddress}
              locale={locale === 'en' ? 'en' : 'fr'}
            />
          </div>
        )}
      </div>

      {/* Standalone PET_TAXI timeline */}
      {standaloneTrip && (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
          <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2">
            <span className="text-base">🚗</span>
            {locale === 'fr' ? 'Suivi du transport' : 'Transport tracking'}
          </h3>
          <TaxiTimeline trip={standaloneTrip} locale={locale} />
          {bookingStatus === 'IN_PROGRESS' && (
            <TaxiHeartbeatIndicator bookingId={bookingId} locale={locale} />
          )}
          {rawStandaloneTrip && (
            <TaxiTrackingButton
              taxiTripId={rawStandaloneTrip.id}
              tripType={rawStandaloneTrip.tripType}
              status={rawStandaloneTrip.status}
              trackingActive={rawStandaloneTrip.trackingActive}
              trackingToken={rawStandaloneTrip.trackingToken}
              locale={locale}
            />
          )}
          {rawStandaloneTrip?.trackingActive && rawStandaloneTrip.trackingToken && (
            <AdminTaxiLiveMap trackingToken={rawStandaloneTrip.trackingToken} locale={locale} />
          )}
          {/* REPLAY mode — visible once the trip reaches a terminal status
              (driver arrived at destination) and live tracking is off. */}
          {rawStandaloneTrip && !rawStandaloneTrip.trackingActive && (
            rawStandaloneTrip.status === 'ARRIVED_AT_PENSION' ||
            rawStandaloneTrip.status === 'ARRIVED_AT_CLIENT' ||
            rawStandaloneTrip.status === 'COMPLETED' ||
            bookingStatus === 'COMPLETED'
          ) && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-charcoal/70 uppercase tracking-wider">
                {locale === 'fr' ? 'Replay du trajet' : 'Trip replay'}
              </h4>
              <AdminTaxiReplay taxiTripId={rawStandaloneTrip.id} locale={locale} />
            </div>
          )}
          {/* Persistent cumulative distance — survives tracking stop and page refresh. */}
          {rawStandaloneTrip && rawStandaloneTrip.distanceKm > 0 && (
            <div className="flex items-center justify-between text-xs px-3 py-2 bg-[#FEFCF9] rounded-lg border border-[rgba(196,151,74,0.2)]">
              <span className="text-charcoal/60">
                {locale === 'fr' ? 'Distance totale parcourue' : 'Total distance traveled'}
              </span>
              <span className="font-semibold text-[#C4974A]">
                {rawStandaloneTrip.distanceKm >= 10
                  ? `${rawStandaloneTrip.distanceKm.toFixed(1)} km`
                  : `${rawStandaloneTrip.distanceKm.toFixed(2)} km`}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
