'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-xl border border-red-100 shadow-card p-8 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 bg-red-50 rounded-full">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h2 className="text-xl font-serif font-semibold text-charcoal">
          Une erreur est survenue
        </h2>
        <p className="text-sm text-gray-500">
          Une erreur inattendue s&apos;est produite. L&apos;équipe a été notifiée automatiquement.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono">Référence : {error.digest}</p>
        )}
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
