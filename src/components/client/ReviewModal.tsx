'use client';

import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ReviewModalProps {
  bookingId: string;
  locale: string;
  onClose: () => void;
  onSuccess: () => void;
}

const labels = {
  fr: {
    title: 'Donner votre avis',
    subtitle: 'Notez votre expérience avec Dog Universe',
    rating: 'Note',
    comment: 'Commentaire (optionnel)',
    commentPlaceholder: 'Partagez votre expérience...',
    submit: 'Envoyer mon avis',
    submitting: 'Envoi en cours...',
    success: 'Merci pour votre avis !',
    error: 'Une erreur est survenue',
    ratingRequired: 'Veuillez sélectionner une note',
  },
  en: {
    title: 'Leave a review',
    subtitle: 'Rate your experience with Dog Universe',
    rating: 'Rating',
    comment: 'Comment (optional)',
    commentPlaceholder: 'Share your experience...',
    submit: 'Submit review',
    submitting: 'Submitting...',
    success: 'Thank you for your feedback!',
    error: 'Something went wrong',
    ratingRequired: 'Please select a rating',
  },
  ar: {
    title: 'تقييمك',
    subtitle: 'قيّم تجربتك مع Dog Universe',
    rating: 'التقييم',
    comment: 'تعليق (اختياري)',
    commentPlaceholder: 'شاركنا تجربتك...',
    submit: 'إرسال التقييم',
    submitting: 'جارٍ الإرسال...',
    success: 'شكرًا على تقييمك!',
    error: 'حدث خطأ',
    ratingRequired: 'الرجاء اختيار تقييم',
  },
};

export default function ReviewModal({ bookingId, locale, onClose, onSuccess }: ReviewModalProps) {
  const t = labels[locale as keyof typeof labels] ?? labels.fr;
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) {
      toast({ title: t.ratingRequired, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, comment: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error('error');
      toast({ title: t.success });
      onSuccess();
      onClose();
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#F0D98A]/30 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-ivory-100">
          <div>
            <h2 className="font-bold text-charcoal text-base">{t.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{t.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-charcoal hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Etoiles */}
          <div>
            <p className="text-sm font-medium text-charcoal mb-2">{t.rating}</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hovered || rating)
                        ? 'text-gold-500 fill-gold-500'
                        : 'text-gray-200 fill-gray-200'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">{t.comment}</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t.commentPlaceholder}
              maxLength={500}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{comment.length}/500</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-ivory-100">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
            {locale === 'fr' ? 'Annuler' : locale === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="flex-1 bg-gold-500 hover:bg-gold-600 text-white"
          >
            {submitting ? t.submitting : t.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
