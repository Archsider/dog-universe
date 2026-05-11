'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WizardLabels } from '../_lib/i18n';

interface Props {
  locale: string;
  l: WizardLabels;
  bookingRef: string;
  onNewBooking: () => void;
}

export function ConfirmedStep({ locale, l, bookingRef, onNewBooking }: Props) {
  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="text-xl font-semibold text-charcoal mb-2">{l.confirmedTitle}</h3>
      <p className="text-gray-500 mb-4">{l.confirmedDesc}</p>
      {bookingRef && (
        <div className="inline-block bg-ivory-100 px-4 py-2 rounded-lg text-sm">
          <span className="text-gray-500">{l.ref} : </span>
          <span className="font-mono font-bold text-charcoal">{bookingRef}</span>
        </div>
      )}
      <div className="flex gap-3 mt-6">
        <Link href={`/${locale}/client/history`} className="flex-1">
          <Button variant="outline" className="w-full">{l.viewHistory}</Button>
        </Link>
        <Button className="flex-1" onClick={onNewBooking}>
          {l.newBooking}
        </Button>
      </div>
    </div>
  );
}
