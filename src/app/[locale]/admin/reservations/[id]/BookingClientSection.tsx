import Link from 'next/link';
import WhatsAppButton from '@/components/admin/WhatsAppButton';
import type { TaxiTripData } from '@/components/shared/TaxiTimeline';

interface BookingClientSectionProps {
  client: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
  };
  locale: string;
  label: string;
  isBoarding: boolean;
  bookingId: string;
  bookingStatus: string;
  standaloneTrip: TaxiTripData | null;
  taxiTrips: Array<{
    tripType: string;
    trackingActive: boolean;
    trackingToken: string | null;
  }>;
}

export default function BookingClientSection({
  client,
  locale,
  label,
  isBoarding,
  bookingId,
  bookingStatus,
  standaloneTrip,
  taxiTrips,
}: BookingClientSectionProps) {
  const rawStandalone = taxiTrips.find(t => t.tripType === 'STANDALONE');
  const showTrackingLink =
    !isBoarding &&
    bookingStatus === 'IN_PROGRESS' &&
    standaloneTrip &&
    rawStandalone?.trackingActive &&
    rawStandalone.trackingToken;

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">{label}</h3>
      <Link href={`/${locale}/admin/clients/${client.id}`} className="text-gold-600 hover:underline font-medium">
        {client.name}
      </Link>
      <p className="text-sm text-gray-500">{client.email}</p>
      {client.phone && (
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <p className="text-sm text-gray-500">{client.phone}</p>
          {showTrackingLink && rawStandalone?.trackingToken ? (
            <WhatsAppButton
              phone={client.phone}
              message={`Bonjour ${client.name}, suivez votre taxi en temps réel : ${process.env.NEXTAUTH_URL ?? ''}/taxi/${rawStandalone.trackingToken}`}
              label={locale === 'fr' ? 'Envoyer lien tracking' : 'Send tracking link'}
              variant="full"
            />
          ) : (
            <WhatsAppButton
              phone={client.phone}
              message={`Bonjour ${client.name}, je vous contacte de la part de Dog Universe. Comment puis-je vous aider ?`}
              variant="icon"
            />
          )}
        </div>
      )}
    </div>
  );
}
