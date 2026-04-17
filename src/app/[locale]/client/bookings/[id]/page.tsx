import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Calendar, PawPrint, Package, Car,
  FileText, Camera, MessageSquare,
  XCircle, Clock,
  Check, MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import CancelBookingButton from '../../history/CancelBookingButton';
import AutoRefresh from '@/components/shared/AutoRefresh';
import RequestExtensionButton from './RequestExtensionButton';
import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';

interface PageProps { params: { locale: string; id: string } }

// Stepper steps par pipeline
const BOARDING_STEPS = [
  { status: 'PENDING',     labelFr: 'Demande reçue',       labelEn: 'Request received',   descFr: 'Votre demande est en cours de traitement',        descEn: 'Your request is being processed' },
  { status: 'CONFIRMED',   labelFr: 'Séjour confirmé',      labelEn: 'Stay confirmed',      descFr: 'Notre équipe a confirmé votre réservation',        descEn: 'Our team confirmed your booking' },
  { status: 'IN_PROGRESS', labelFr: 'Dans nos murs',        labelEn: 'Currently staying',   descFr: 'Votre animal est avec nous',                       descEn: 'Your pet is with us' },
  { status: 'COMPLETED',   labelFr: 'Séjour terminé',       labelEn: 'Stay completed',      descFr: 'Le séjour s\'est terminé avec succès',             descEn: 'The stay completed successfully' },
];

const TAXI_STEPS = [
  { status: 'PENDING',     labelFr: 'Transport planifié',              labelEn: 'Transport planned',    descFr: 'Votre transport a été programmé',                  descEn: 'Your transport has been scheduled' },
  { status: 'CONFIRMED',   labelFr: 'Véhicule en route vers le point de départ', labelEn: 'Vehicle en route to pickup', descFr: 'Le véhicule est en chemin vers le point de départ', descEn: 'The vehicle is heading to the pickup point' },
  { status: 'AT_PICKUP',   labelFr: 'Véhicule sur place',              labelEn: 'Vehicle on site',      descFr: 'Le véhicule est arrivé au point de départ',        descEn: 'The vehicle has arrived at the pickup point' },
  { status: 'IN_PROGRESS', labelFr: 'Animal à bord',                   labelEn: 'Pet on board',         descFr: 'Votre animal est dans le véhicule',                descEn: 'Your pet is in the vehicle' },
  { status: 'COMPLETED',   labelFr: 'Arrivé à destination',            labelEn: 'Arrived',              descFr: 'Votre animal est arrivé à destination',            descEn: 'Your pet has arrived safely' },
];

const BOARDING_STATUS_ORDER = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const TAXI_STATUS_ORDER = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS', 'COMPLETED'];

function BookingStepper({
  status,
  serviceType,
  locale,
}: {
  status: string;
  serviceType: string;
  locale: string;
}) {
  const isFr = locale === 'fr';
  const isCancelled = status === 'CANCELLED' || status === 'REJECTED';
  const steps = serviceType === 'PET_TAXI' ? TAXI_STEPS : BOARDING_STEPS;
  const statusOrder = serviceType === 'PET_TAXI' ? TAXI_STATUS_ORDER : BOARDING_STATUS_ORDER;
  const currentIdx = statusOrder.indexOf(status);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-700 text-sm">
            {status === 'CANCELLED'
              ? (isFr ? 'Réservation annulée' : 'Booking cancelled')
              : (isFr ? 'Réservation refusée' : 'Booking refused')}
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            {isFr ? 'Cette réservation n\'est plus active.' : 'This booking is no longer active.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map((step, idx) => {
        const isDone = currentIdx > idx;
        const isActive = currentIdx === idx;
        const isFuture = currentIdx < idx;

        return (
          <div key={step.status} className="flex gap-4">
            {/* Indicateur vertical */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                isDone
                  ? 'bg-green-500 text-white'
                  : isActive
                  ? 'bg-charcoal text-white ring-4 ring-charcoal/10'
                  : 'bg-ivory-100 text-gray-300 border border-ivory-200'
              }`}>
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <span className="text-xs font-bold">{idx + 1}</span>
                ) : (
                  <span className="text-xs text-gray-300">{idx + 1}</span>
                )}
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${
                  isDone ? 'bg-green-300' : 'bg-ivory-200'
                }`} />
              )}
            </div>

            {/* Contenu */}
            <div className={`pb-4 flex-1 ${idx === steps.length - 1 ? 'pb-0' : ''}`}>
              <p className={`text-sm font-semibold leading-tight mt-1 ${
                isDone ? 'text-green-700' : isActive ? 'text-charcoal' : 'text-gray-300'
              }`}>
                {isFr ? step.labelFr : step.labelEn}
              </p>
              {isActive && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {isFr ? step.descFr : step.descEn}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function ClientBookingDetailPage({ params: { locale, id } }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      taxiTrips: {
        include: { history: { orderBy: { timestamp: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
      invoice: { include: { items: true } },
      stayPhotos: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!booking || booking.clientId !== session.user.id) notFound();

  // Supplementary extension invoice (bookingId: null, tracked via supplementaryForBookingId or legacy notes)
  const supplementaryInvoice = await prisma.invoice.findFirst({
    where: {
      status: { notIn: ['CANCELLED'] },
      OR: [
        { supplementaryForBookingId: id },
        // legacy fallback for rows created before the FK column was added
        { clientId: session.user.id, notes: `EXTENSION_SURCHARGE:${id}` },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Admin messages related to this booking
  const adminMessages = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      type: { in: ['ADMIN_MESSAGE', 'STAY_PHOTO'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const bookingMessages = adminMessages.filter(n => {
    if (!n.metadata) return false;
    try {
      const parsed: unknown = JSON.parse(n.metadata);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        && (parsed as Record<string, unknown>).bookingId === id;
    } catch { return false; }
  });

  const l = {
    fr: {
      back: 'Mes réservations',
      service: 'Service',
      boarding: 'Pension',
      taxi: 'Taxi animalier',
      pets: 'Animaux',
      dates: 'Dates',
      duration: 'Durée',
      nights: 'nuit(s)',
      arrival: 'Arrivée',
      departure: 'Départ',
      grooming: 'Toilettage',
      yes: 'Inclus',
      no: 'Non',
      taxiType: 'Type de course',
      notes: 'Notes',
      pricing: 'Détail du prix',
      perNight: '/nuit',
      invoice: 'Facture',
      noPdf: 'Télécharger PDF',
      photos: 'Photos de séjour',
      noPhotos: 'Aucune photo publiée pour l\'instant',
      messages: 'Messages de Dog Universe',
      noMessages: 'Aucun message pour l\'instant',
      cancel: 'Annuler la réservation',
      progression: 'Suivi de votre réservation',
      supplementaryInvoice: 'Supplément prolongation',
      invoiceNumber: 'Facture',
      amount: 'Montant',
      paid: 'Payé',
      remaining: 'Reste à payer',
      statusPaid: 'Payée',
      statusPending: 'En attente',
      statusPartial: 'Partiellement payée',
      statusLabels: {
        PENDING: 'En attente', CONFIRMED: 'Confirmée', IN_PROGRESS: 'En cours',
        COMPLETED: 'Terminée', CANCELLED: 'Annulée', REJECTED: 'Refusée',
      },
      taxiTypes: { STANDARD: 'Course standard', VET: 'Transport vétérinaire', AIRPORT: 'Navette aéroport' },
      pickup: 'Départ',
      dropoff: 'Arrivée',
    },
    en: {
      back: 'My bookings',
      service: 'Service',
      boarding: 'Boarding',
      taxi: 'Pet Taxi',
      pets: 'Pets',
      dates: 'Dates',
      duration: 'Duration',
      nights: 'night(s)',
      arrival: 'Arrival',
      departure: 'Departure',
      grooming: 'Grooming',
      yes: 'Included',
      no: 'No',
      taxiType: 'Trip type',
      notes: 'Notes',
      pricing: 'Price breakdown',
      perNight: '/night',
      invoice: 'Invoice',
      noPdf: 'Download PDF',
      photos: 'Stay photos',
      noPhotos: 'No photos published yet',
      messages: 'Messages from Dog Universe',
      noMessages: 'No messages yet',
      cancel: 'Cancel booking',
      progression: 'Booking progress',
      supplementaryInvoice: 'Extension supplement',
      invoiceNumber: 'Invoice',
      amount: 'Amount',
      paid: 'Paid',
      remaining: 'Remaining',
      statusPaid: 'Paid',
      statusPending: 'Pending',
      statusPartial: 'Partially paid',
      statusLabels: {
        PENDING: 'Pending', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress',
        COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected',
      },
      taxiTypes: { STANDARD: 'Standard ride', VET: 'Vet transport', AIRPORT: 'Airport shuttle' },
      pickup: 'Pickup',
      dropoff: 'Dropoff',
    },
  };
  const t = l[locale as keyof typeof l] || l.fr;

  const isActive = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'].includes(booking.status);
  const isBoarding = booking.serviceType === 'BOARDING';

  // Serialize TaxiTrip data for client component
  const serializedTrips: TaxiTripData[] = booking.taxiTrips.map(t => ({
    id: t.id,
    tripType: t.tripType,
    status: t.status,
    date: t.date,
    time: t.time,
    address: t.address,
    history: t.history.map(h => ({
      id: h.id,
      status: h.status,
      timestamp: h.timestamp.toISOString(),
      updatedBy: h.updatedBy,
    })),
  }));
  const standaloneTrip = serializedTrips.find(t => t.tripType === 'STANDALONE') ?? null;
  const goTrip         = serializedTrips.find(t => t.tripType === 'OUTBOUND')   ?? null;
  const returnTrip     = serializedTrips.find(t => t.tripType === 'RETURN')     ?? null;
  const nights = booking.endDate
    ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canCancel = ['PENDING', 'CONFIRMED'].includes(booking.status);
  const statusLabel = t.statusLabels[booking.status as keyof typeof t.statusLabels] || booking.status;

  // Parse taxi addresses from notes
  const taxiDeparture = booking.notes?.match(/Départ:\s*([^|]+)/)?.[1]?.trim() ?? null;
  const taxiArrival = booking.notes?.match(/Arrivée:\s*([^|]+)/)?.[1]?.trim() ?? null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Auto-refresh pour les réservations actives (toutes les 30s) */}
      {isActive && <AutoRefresh intervalMs={30000} />}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/history`} className="text-gray-400 hover:text-charcoal transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-mono font-bold text-charcoal text-lg">{booking.id.slice(0, 8).toUpperCase()}</h1>
            <Badge className={getBookingStatusColor(booking.status)}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-xs text-gray-400">{formatDate(booking.createdAt, locale)}</p>
        </div>
        {canCancel && <CancelBookingButton bookingId={booking.id} locale={locale} />}
      </div>

      <div className="space-y-4">
        {/* Stepper de progression — card premium */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <div className={`p-2 rounded-lg ${isBoarding ? 'bg-gold-50' : 'bg-blue-50'}`}>
              {isBoarding
                ? <Package className="h-4 w-4 text-gold-500" />
                : <Car className="h-4 w-4 text-blue-500" />}
            </div>
            <div>
              <p className="font-semibold text-charcoal text-sm">{isBoarding ? t.boarding : t.taxi}</p>
              <p className="text-xs text-gray-400">{t.progression}</p>
            </div>
          </div>
          {isBoarding || !standaloneTrip
            ? <BookingStepper status={booking.status} serviceType={booking.serviceType} locale={locale} />
            : <TaxiTimeline trip={standaloneTrip} readOnly locale={locale} />}
        </div>

        {/* Service + Dates */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <div className="space-y-2 text-sm">
            {isBoarding ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.arrival}</span>
                  <span className="font-medium text-charcoal">{formatDate(booking.startDate, locale)}</span>
                </div>
                {booking.endDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.departure}</span>
                    <span className="font-medium text-charcoal">{formatDate(booking.endDate, locale)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{t.duration}</span>
                  <span className="font-semibold text-gold-600">{nights} {t.nights}</span>
                </div>
                {booking.boardingDetail && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.grooming}</span>
                    <span className="font-medium text-charcoal">{booking.boardingDetail.includeGrooming ? t.yes : t.no}</span>
                  </div>
                )}
                {booking.boardingDetail?.taxiGoEnabled && (
                  <>
                    <div className="mt-2 pt-2 border-t border-ivory-100">
                      <p className="text-xs font-semibold text-orange-700 mb-1">{locale === 'fr' ? 'Taxi aller — dépôt à la pension' : 'Taxi go — drop-off at facility'}</p>
                    </div>
                    {booking.boardingDetail.taxiGoDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{locale === 'fr' ? 'Date' : 'Date'}</span>
                        <span className="font-medium text-charcoal">{booking.boardingDetail.taxiGoDate}{booking.boardingDetail.taxiGoTime ? ` — ${booking.boardingDetail.taxiGoTime}` : ''}</span>
                      </div>
                    )}
                    {booking.boardingDetail.taxiGoAddress && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-orange-400" />{locale === 'fr' ? 'Adresse' : 'Address'}</span>
                        <span className="font-medium text-charcoal text-right">{booking.boardingDetail.taxiGoAddress}</span>
                      </div>
                    )}
                  </>
                )}
                {booking.boardingDetail?.taxiReturnEnabled && (
                  <>
                    <div className="mt-2 pt-2 border-t border-ivory-100">
                      <p className="text-xs font-semibold text-orange-700 mb-1">{locale === 'fr' ? 'Taxi retour — récupération à domicile' : 'Taxi return — pick-up at home'}</p>
                    </div>
                    {booking.boardingDetail.taxiReturnDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{locale === 'fr' ? 'Date' : 'Date'}</span>
                        <span className="font-medium text-charcoal">{booking.boardingDetail.taxiReturnDate}{booking.boardingDetail.taxiReturnTime ? ` — ${booking.boardingDetail.taxiReturnTime}` : ''}</span>
                      </div>
                    )}
                    {booking.boardingDetail.taxiReturnAddress && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-orange-400" />{locale === 'fr' ? 'Adresse' : 'Address'}</span>
                        <span className="font-medium text-charcoal text-right">{booking.boardingDetail.taxiReturnAddress}</span>
                      </div>
                    )}
                  </>
                )}
                {/* Taxi addon timelines — read-only */}
                {goTrip && (
                  <div className="mt-3 pt-3 border-t border-ivory-100">
                    <p className="text-xs font-semibold text-orange-700 mb-2">
                      {locale === 'fr' ? '↗ Taxi aller' : '↗ Taxi go'}
                    </p>
                    <TaxiTimeline trip={goTrip} readOnly locale={locale} />
                  </div>
                )}
                {returnTrip && (
                  <div className="mt-3 pt-3 border-t border-ivory-100">
                    <p className="text-xs font-semibold text-orange-700 mb-2">
                      {locale === 'fr' ? '↙ Taxi retour' : '↙ Taxi return'}
                    </p>
                    <TaxiTimeline trip={returnTrip} readOnly locale={locale} />
                  </div>
                )}

                {['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && booking.endDate && (
                  <div className="mt-3 pt-3 border-t border-ivory-100">
                    <RequestExtensionButton
                      bookingId={booking.id}
                      currentEndDate={booking.endDate}
                      hasExtensionRequest={booking.hasExtensionRequest}
                      locale={locale}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.dates}</span>
                  <span className="font-medium text-charcoal">{formatDate(booking.startDate, locale)}</span>
                </div>
                {booking.arrivalTime && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Heure</span>
                    <span className="font-medium text-charcoal">{booking.arrivalTime}</span>
                  </div>
                )}
                {booking.taxiDetail && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.taxiType}</span>
                    <span className="font-medium text-charcoal">{t.taxiTypes[booking.taxiDetail.taxiType as keyof typeof t.taxiTypes] || booking.taxiDetail.taxiType}</span>
                  </div>
                )}
                {taxiDeparture && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-green-500" />{t.pickup}</span>
                    <span className="font-medium text-charcoal text-right">{taxiDeparture}</span>
                  </div>
                )}
                {taxiArrival && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-red-400" />{t.dropoff}</span>
                    <span className="font-medium text-charcoal text-right">{taxiArrival}</span>
                  </div>
                )}
              </>
            )}
            {booking.notes && !booking.notes.includes('Départ:') && !booking.notes.includes('Arrivée:') && (
              <div className="mt-2 pt-2 border-t border-ivory-100">
                <p className="text-gray-400 text-xs mb-1">{t.notes}</p>
                <p className="text-charcoal italic">{booking.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Pets */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <PawPrint className="h-4 w-4 text-gold-500" />
            <h3 className="font-semibold text-charcoal text-sm">{t.pets}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {booking.bookingPets.map(bp => (
              <Link
                key={bp.id}
                href={`/${locale}/client/pets/${bp.pet.id}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-ivory-50 rounded-lg border border-[#F0D98A]/30 hover:border-gold-400 transition-colors"
              >
                {bp.pet.photoUrl ? (
                  <Image src={bp.pet.photoUrl} alt={bp.pet.name} width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gold-100 flex items-center justify-center text-xs font-bold text-gold-600">
                    {bp.pet.name[0]}
                  </div>
                )}
                <span className="text-sm font-medium text-charcoal">{bp.pet.name}</span>
                <span className="text-xs text-gray-400">{bp.pet.breed || bp.pet.species}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Pricing */}
        {(booking.boardingDetail || booking.taxiDetail) && (
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal text-sm mb-3">{t.pricing}</h3>
            <div className="space-y-2 text-sm">
              {booking.boardingDetail && (
                <>
                  {booking.boardingDetail.pricePerNight > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.boarding} × {nights} {t.nights}</span>
                      <span className="text-charcoal">{formatMAD(booking.boardingDetail.pricePerNight * nights)}</span>
                    </div>
                  )}
                  {booking.boardingDetail.includeGrooming && booking.boardingDetail.groomingPrice > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.grooming}</span>
                      <span className="text-charcoal">{formatMAD(booking.boardingDetail.groomingPrice)}</span>
                    </div>
                  )}
                  {booking.boardingDetail.taxiAddonPrice > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.taxi}</span>
                      <span className="text-charcoal">{formatMAD(booking.boardingDetail.taxiAddonPrice)}</span>
                    </div>
                  )}
                </>
              )}
              {booking.taxiDetail && booking.taxiDetail.price > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.taxi}</span>
                  <span className="text-charcoal">{formatMAD(booking.taxiDetail.price)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-ivory-100 font-semibold">
                <span className="text-charcoal">Total</span>
                <span className="text-gold-600 text-base">
                  {booking.invoice ? formatMAD(booking.invoice.amount) : formatMAD(booking.totalPrice)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Invoice */}
        {booking.invoice && (
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-gold-500" />
              <h3 className="font-semibold text-charcoal text-sm">{t.invoice}</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-charcoal">{booking.invoice.invoiceNumber}</p>
                <p className="text-lg font-bold text-gold-600">{formatMAD(booking.invoice.amount)}</p>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  booking.invoice.status === 'PAID'
                    ? 'bg-green-100 text-green-700'
                    : booking.invoice.status === 'PARTIALLY_PAID'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {booking.invoice.status === 'PAID'
                    ? (locale === 'fr' ? 'Payée' : 'Paid')
                    : booking.invoice.status === 'PARTIALLY_PAID'
                    ? (locale === 'fr' ? 'Partiellement payée' : 'Partially paid')
                    : (locale === 'fr' ? 'En attente' : 'Pending')}
                </span>
              </div>
              <a
                href={`/api/invoices/${booking.invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-gold-50 text-gold-700 rounded-lg text-sm font-medium hover:bg-gold-100 transition-colors border border-gold-200"
              >
                <FileText className="h-4 w-4" />
                PDF
              </a>
            </div>
          </div>
        )}

        {/* Supplementary extension invoice */}
        {supplementaryInvoice && (
          <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-charcoal text-sm">{t.supplementaryInvoice}</h3>
              <span className="ml-auto text-xs px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                {locale === 'fr' ? `Réservation #${booking.id.slice(0, 8).toUpperCase()}` : `Booking #${booking.id.slice(0, 8).toUpperCase()}`}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t.invoiceNumber}</span>
                <span className="font-mono font-semibold text-charcoal">{supplementaryInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t.amount}</span>
                <span className="font-bold text-amber-600">{formatMAD(supplementaryInvoice.amount)}</span>
              </div>
              {supplementaryInvoice.paidAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.paid}</span>
                  <span className="text-green-600">{formatMAD(supplementaryInvoice.paidAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-ivory-100">
                <span className="text-gray-500">{t.remaining}</span>
                <span className="font-semibold text-charcoal">{formatMAD(supplementaryInvoice.amount - supplementaryInvoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-gray-500">Statut</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  supplementaryInvoice.status === 'PAID'
                    ? 'bg-green-100 text-green-700'
                    : supplementaryInvoice.status === 'PARTIALLY_PAID'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {supplementaryInvoice.status === 'PAID'
                    ? t.statusPaid
                    : supplementaryInvoice.status === 'PARTIALLY_PAID'
                    ? t.statusPartial
                    : t.statusPending}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stay photos */}
        {isBoarding && (
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-4 w-4 text-gold-500" />
              <h3 className="font-semibold text-charcoal text-sm">{t.photos}</h3>
              {booking.stayPhotos.length > 0 && (
                <span className="text-xs text-gold-600 font-medium ml-auto">{booking.stayPhotos.length}</span>
              )}
            </div>
            {booking.stayPhotos.length === 0 ? (
              <p className="text-sm text-gray-400">{t.noPhotos}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {booking.stayPhotos.map(photo => (
                  <div key={photo.id} className="rounded-lg overflow-hidden border border-[#F0D98A]/30 aspect-square">
                    <Image
                      src={photo.url}
                      alt={photo.caption || ''}
                      width={200}
                      height={200}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            {booking.stayPhotos.some(p => p.caption) && (
              <div className="mt-3 space-y-1">
                {booking.stayPhotos.filter(p => p.caption).map(photo => (
                  <p key={photo.id} className="text-xs text-gray-500 italic">• {photo.caption}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin messages */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-gold-500" />
            <h3 className="font-semibold text-charcoal text-sm">{t.messages}</h3>
          </div>
          {bookingMessages.length === 0 ? (
            <p className="text-sm text-gray-400">{t.noMessages}</p>
          ) : (
            <div className="space-y-3">
              {bookingMessages.map(msg => (
                <div key={msg.id} className="bg-[#FEFCE8] border border-[#F0D98A]/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">D</span>
                    </div>
                    <span className="text-xs font-semibold text-gold-700">Dog Universe</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatDate(new Date(msg.createdAt), locale)}
                    </span>
                  </div>
                  <p className="text-sm text-charcoal">
                    {locale === 'en' ? msg.messageEn : msg.messageFr}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
