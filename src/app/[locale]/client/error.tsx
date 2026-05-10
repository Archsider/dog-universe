'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    const id = Sentry.captureException(error);
    setEventId(id ?? null);
  }, [error]);

  const showFeedback = () => {
    if (!eventId) return;
    try {
      Sentry.showReportDialog({ eventId });
    } catch {
      // showReportDialog requires the standard Sentry integration — silently ignore
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-8 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 bg-amber-50 rounded-full">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
        </div>
        <h2 className="text-xl font-serif font-semibold text-charcoal">
          Une erreur est survenue
        </h2>
        <p className="text-sm text-gray-500">
          Une erreur inattendue s&apos;est produite. Vous pouvez réessayer ou contacter le support.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono">Digest : {error.digest}</p>
        )}
        {eventId && (
          <p className="text-xs text-gray-400 font-mono">Sentry : {eventId}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="gap-2 bg-gold-500 hover:bg-gold-600 text-white">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
          {eventId && (
            <Button onClick={showFeedback} variant="outline" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Reporter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
