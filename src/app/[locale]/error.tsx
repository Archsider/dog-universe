'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'fr';

  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-serif font-bold text-charcoal mb-2">
          {locale === 'en' ? 'Something went wrong' : 'Une erreur est survenue'}
        </h1>
        <p className="text-gray-500 mb-8 text-sm">
          {locale === 'en'
            ? 'An unexpected error occurred. Please try again.'
            : 'Une erreur inattendue s\'est produite. Veuillez réessayer.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {locale === 'en' ? 'Try again' : 'Réessayer'}
          </Button>
          <Button asChild>
            <Link href={`/${locale}`}>
              <Home className="h-4 w-4 mr-2" />
              {locale === 'en' ? 'Home' : 'Accueil'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
