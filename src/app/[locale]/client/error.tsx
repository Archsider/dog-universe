'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ClientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'fr';

  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 mx-auto mb-5 bg-red-50 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <h2 className="text-xl font-serif font-bold text-charcoal mb-2">
          {locale === 'en' ? 'Something went wrong' : 'Une erreur est survenue'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {locale === 'en' ? 'Unable to load this page.' : 'Impossible de charger cette page.'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {locale === 'en' ? 'Retry' : 'Réessayer'}
          </Button>
          <Button asChild size="sm">
            <Link href={`/${locale}/client/dashboard`}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              {locale === 'en' ? 'Dashboard' : 'Tableau de bord'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
