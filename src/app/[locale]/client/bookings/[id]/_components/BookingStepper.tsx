import { XCircle, Check } from 'lucide-react';

const BOARDING_STEPS = [
  { status: 'PENDING',     labelFr: 'Demande reçue',       labelEn: 'Request received',   labelAr: 'تم استلام الطلب',       descFr: 'Votre demande est en cours de traitement',        descEn: 'Your request is being processed',      descAr: 'طلبك قيد المعالجة' },
  { status: 'CONFIRMED',   labelFr: 'Séjour confirmé',      labelEn: 'Stay confirmed',      labelAr: 'تأكيد الإقامة',         descFr: 'Notre équipe a confirmé votre réservation',        descEn: 'Our team confirmed your booking',       descAr: 'أكد فريقنا حجزك' },
  { status: 'IN_PROGRESS', labelFr: 'Dans nos murs',        labelEn: 'Currently staying',   labelAr: 'في رعايتنا',            descFr: 'Votre animal est avec nous',                       descEn: 'Your pet is with us',                   descAr: 'حيوانك الأليف معنا' },
  { status: 'COMPLETED',   labelFr: 'Séjour terminé',       labelEn: 'Stay completed',      labelAr: 'انتهت الإقامة',         descFr: 'Le séjour s\'est terminé avec succès',             descEn: 'The stay completed successfully',       descAr: 'انتهت الإقامة بنجاح' },
];

const TAXI_STEPS = [
  { status: 'PENDING',     labelFr: 'Transport planifié',              labelEn: 'Transport planned',    labelAr: 'النقل مجدول',            descFr: 'Votre transport a été programmé',                  descEn: 'Your transport has been scheduled',   descAr: 'تم جدولة نقلك' },
  { status: 'CONFIRMED',   labelFr: 'Véhicule en route vers le point de départ', labelEn: 'Vehicle en route to pickup', labelAr: 'السيارة في الطريق', descFr: 'Le véhicule est en chemin vers le point de départ', descEn: 'The vehicle is heading to the pickup point', descAr: 'السيارة في طريقها إلى نقطة الانطلاق' },
  { status: 'AT_PICKUP',   labelFr: 'Véhicule sur place',              labelEn: 'Vehicle on site',      labelAr: 'السيارة في المكان',      descFr: 'Le véhicule est arrivé au point de départ',        descEn: 'The vehicle has arrived at the pickup point', descAr: 'وصلت السيارة إلى نقطة الانطلاق' },
  { status: 'IN_PROGRESS', labelFr: 'Animal à bord',                   labelEn: 'Pet on board',         labelAr: 'الحيوان على متن السيارة', descFr: 'Votre animal est dans le véhicule',                descEn: 'Your pet is in the vehicle',          descAr: 'حيوانك الأليف في السيارة' },
  { status: 'COMPLETED',   labelFr: 'Arrivé à destination',            labelEn: 'Arrived',              labelAr: 'وصل إلى الوجهة',         descFr: 'Votre animal est arrivé à destination',            descEn: 'Your pet has arrived safely',         descAr: 'وصل حيوانك الأليف بأمان' },
];

const BOARDING_STATUS_ORDER = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const TAXI_STATUS_ORDER = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS', 'COMPLETED'];

interface BookingStepperProps {
  status: string;
  serviceType: string;
  locale: string;
}

export default function BookingStepper({ status, serviceType, locale }: BookingStepperProps) {
  const isFr = locale === 'fr';
  const isAr = locale === 'ar';
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
              ? (isFr ? 'Réservation annulée' : isAr ? 'تم إلغاء الحجز' : 'Booking cancelled')
              : (isFr ? 'Réservation refusée' : isAr ? 'تم رفض الحجز' : 'Booking refused')}
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            {isFr ? 'Cette réservation n\'est plus active.' : isAr ? 'هذا الحجز لم يعد نشطًا.' : 'This booking is no longer active.'}
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
                {isFr ? step.labelFr : isAr ? step.labelAr : step.labelEn}
              </p>
              {isActive && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {isFr ? step.descFr : isAr ? step.descAr : step.descEn}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
