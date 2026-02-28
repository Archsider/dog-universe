import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Calendar, PawPrint, Package, Car,
  FileText, Camera, MessageSquare, CheckCircle2,
  XCircle, AlertCircle, PlayCircle, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import CancelBookingButton from '../../history/CancelBookingButton';

interface PageProps { params: { locale: string; id: string } }

const STATUS_ICONS: Record<string, React.ElementType> = {
  PENDING:     AlertCircle,
  CONFIRMED:   CheckCircle2,
  IN_PROGRESS: PlayCircle,
  COMPLETED:   CheckCircle2,
  CANCELLED:   XCircle,
  REJECTED:    XCircle,
};

export default async function ClientBookingDetailPage({ params: { locale, id } }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { include: { items: true } },
      stayPhotos: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!booking || booking.clientId !== session.user.id) notFound();

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
    try { return JSON.parse(n.metadata).bookingId === id; } catch { return false; }
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
      statusLabels: {
        PENDING: 'En attente', CONFIRMED: 'Confirmée', IN_PROGRESS: 'En cours',
        COMPLETED: 'Terminée', CANCELLED: 'Annulée', REJECTED: 'Refusée',
      },
      taxiTypes: { STANDARD: 'Course standard', VET: 'Transport vétérinaire', AIRPORT: 'Navette aéroport' },
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
      statusLabels: {
        PENDING: 'Pending', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress',
        COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected',
      },
      taxiTypes: { STANDARD: 'Standard ride', VET: 'Vet transport', AIRPORT: 'Airport shuttle' },
    },
  };
  const t = l[locale as keyof typeof l] || l.fr;

  const isBoarding = booking.serviceType === 'BOARDING';
  const nights = booking.endDate
    ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canCancel = ['PENDING', 'CONFIRMED'].includes(booking.status);
  const StatusIcon = STATUS_ICONS[booking.status] || AlertCircle;
  const statusLabel = t.statusLabels[booking.status as keyof typeof t.statusLabels] || booking.status;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/history`} className="text-gray-400 hover:text-charcoal transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-mono font-bold text-charcoal text-lg">{booking.id.slice(0, 8).toUpperCase()}</h1>
            <Badge className={getBookingStatusColor(booking.status)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusLabel}
            </Badge>
          </div>
          <p className="text-xs text-gray-400">{formatDate(booking.createdAt, locale)}</p>
        </div>
        {canCancel && <CancelBookingButton bookingId={booking.id} locale={locale} />}
      </div>

      <div className="space-y-4">
        {/* Service + Dates */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <div className={`p-2 rounded-lg ${isBoarding ? 'bg-gold-50' : 'bg-blue-50'}`}>
              {isBoarding ? <Package className="h-4 w-4 text-gold-500" /> : <Car className="h-4 w-4 text-blue-500" />}
            </div>
            <span className="font-semibold text-charcoal">{isBoarding ? t.boarding : t.taxi}</span>
          </div>
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
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.dates}</span>
                  <span className="font-medium text-charcoal">{formatDate(booking.startDate, locale)}</span>
                </div>
                {booking.taxiDetail && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.taxiType}</span>
                    <span className="font-medium text-charcoal">{t.taxiTypes[booking.taxiDetail.taxiType as keyof typeof t.taxiTypes] || booking.taxiDetail.taxiType}</span>
                  </div>
                )}
              </>
            )}
            {booking.notes && (
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
                  booking.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {booking.invoice.status === 'PAID' ? (locale === 'fr' ? 'Payée' : 'Paid') : (locale === 'fr' ? 'En attente' : 'Pending')}
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
