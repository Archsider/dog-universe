'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function LocaleError({
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <h2 className="text-xl font-semibold text-gray-800">
        Une erreur inattendue est survenue
      </h2>
      <p className="text-sm text-gray-500">
        Notre équipe a été notifiée automatiquement.
        {error.digest && (
          <span className="block mt-1 text-xs text-gray-400">Ref : {error.digest}</span>
        )}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
