'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import ReviewModal from './ReviewModal';

interface ReviewButtonProps {
  bookingId: string;
  locale: string;
}

export default function ReviewButton({ bookingId, locale }: ReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const label = locale === 'fr' ? 'Donnez votre avis' : 'Leave a review';
  const doneLabel = locale === 'fr' ? 'Avis envoyé' : 'Review sent';

  if (submitted) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-2 py-1">
        <Star className="h-3.5 w-3.5 fill-green-500 text-green-500" />
        {doneLabel}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-50 text-gold-700 border border-gold-200 rounded-lg text-xs font-medium hover:bg-gold-100 transition-colors"
      >
        <Star className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <ReviewModal
          bookingId={bookingId}
          locale={locale}
          onClose={() => setOpen(false)}
          onSuccess={() => setSubmitted(true)}
        />
      )}
    </>
  );
}
