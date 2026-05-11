'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WizardLabels } from '../_lib/i18n';

interface HeaderProps { locale: string; step: number; title: string }
export function WizardHeader({ locale, step, title }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {step < 5 && (
        <Link href={`/${locale}/client/dashboard`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <h1 className="text-2xl font-serif font-bold text-charcoal">{title}</h1>
    </div>
  );
}

interface ProgressProps { step: number; labels: readonly string[] }
export function WizardProgress({ step, labels }: ProgressProps) {
  if (step >= 5) return null;
  return (
    <div className="flex items-center mb-8">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 transition-colors ${
            step > s ? 'bg-gold-500 text-white' : step === s ? 'bg-charcoal text-white' : 'bg-ivory-200 text-gray-400'
          }`}>
            {step > s ? <Check className="h-4 w-4" /> : s}
          </div>
          <span className="ml-2 text-xs text-gray-500 hidden sm:block">{labels[s - 1]}</span>
          {s < 4 && <div className={`flex-1 h-px mx-2 ${step > s ? 'bg-gold-400' : 'bg-ivory-200'}`} />}
        </div>
      ))}
    </div>
  );
}

interface NavProps {
  step: number;
  l: WizardLabels;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}
export function WizardNav({ step, l, submitting, onBack, onNext, onSubmit }: NavProps) {
  if (step >= 5) return null;
  return (
    <div className="flex gap-3 mt-8">
      {step > 1 && (
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {l.back}
        </Button>
      )}
      {step < 4 ? (
        <Button onClick={onNext} className="flex-1">
          {l.next}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      ) : (
        <Button onClick={onSubmit} disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {l.confirm}
        </Button>
      )}
    </div>
  );
}
