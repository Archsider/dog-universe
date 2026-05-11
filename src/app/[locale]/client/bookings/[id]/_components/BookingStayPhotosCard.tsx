import { Camera } from 'lucide-react';
import StayPhotoFeed from '@/components/client/StayPhotoFeed';
import type { BookingDetailTranslations } from '../_lib/i18n';

interface StayPhoto {
  id: string;
  url: string;
  caption: string | null;
  createdAt: Date;
}

interface BookingStayPhotosCardProps {
  stayPhotos: StayPhoto[];
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingStayPhotosCard({ stayPhotos, locale, t }: BookingStayPhotosCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Camera className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.photos}</h3>
      </div>
      <StayPhotoFeed
        photos={stayPhotos.map(p => ({
          id: p.id,
          url: p.url,
          caption: p.caption,
          createdAt: p.createdAt.toISOString(),
        }))}
        locale={locale}
      />
    </div>
  );
}
