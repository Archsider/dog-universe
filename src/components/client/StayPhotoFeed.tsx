'use client';

import Image from 'next/image';
import { formatDate } from '@/lib/utils';
import { Download } from 'lucide-react';

export interface StayPhoto {
  id: string;
  url: string;
  caption?: string | null;
  createdAt: string; // ISO string (serialized from Date)
}

interface Props {
  photos: StayPhoto[];
  locale: string;
}

const IS_NEW_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function StayPhotoFeed({ photos, locale }: Props) {
  const isFr = locale === 'fr';

  if (photos.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        {isFr
          ? 'Aucune photo partagée pour ce séjour pour l\'instant.'
          : 'No photos shared for this stay yet.'}
      </p>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-4">
      {/* Badge compteur total */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gold-600 bg-gold-50 border border-gold-200 rounded-full px-2.5 py-0.5">
          {photos.length} {isFr ? (photos.length > 1 ? 'photos' : 'photo') : (photos.length > 1 ? 'photos' : 'photo')}
        </span>
      </div>

      {/* Feed vertical */}
      <div className="space-y-5">
        {photos.map((photo) => {
          const uploadedAt = new Date(photo.createdAt);
          const isNew = now - uploadedAt.getTime() < IS_NEW_THRESHOLD_MS;

          return (
            <div key={photo.id} className="rounded-xl overflow-hidden border border-[#F0D98A]/40 shadow-sm">
              {/* Header de la photo */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#FEFCE8] border-b border-[#F0D98A]/40">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">D</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gold-700 leading-tight">
                      {isFr ? 'Partagé par l\'équipe Dog Universe 🐾' : 'Shared by the Dog Universe team 🐾'}
                    </p>
                    <p className="text-xs text-gray-400 leading-tight">
                      {formatDate(uploadedAt, locale)}{' '}
                      {uploadedAt.toLocaleTimeString(isFr ? 'fr-MA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isNew && (
                    <span className="text-xs font-bold bg-amber-400 text-white rounded-full px-2 py-0.5 leading-tight">
                      {isFr ? 'Nouveau' : 'New'}
                    </span>
                  )}
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-800 transition-colors"
                    aria-label={isFr ? 'Télécharger' : 'Download'}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              {/* Photo pleine largeur */}
              <div className="relative w-full bg-gray-50" style={{ aspectRatio: '4/3' }}>
                <Image
                  src={photo.url}
                  alt={photo.caption || (isFr ? 'Photo de séjour' : 'Stay photo')}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 640px"
                />
              </div>

              {/* Caption si présente */}
              {photo.caption && (
                <div className="px-3 py-2 bg-white border-t border-[#F0D98A]/20">
                  <p className="text-xs text-gray-600 italic">{photo.caption}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
