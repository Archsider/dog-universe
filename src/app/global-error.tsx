'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
          background: '#FAF6F0',
          gap: '1rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a1a' }}>
          Une erreur inattendue est survenue
        </h1>
        <p style={{ color: '#666', fontSize: '0.875rem' }}>
          Notre équipe a été notifiée automatiquement.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.5rem',
            background: '#D4AF37',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
