'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  benefitKey: string;
  locale: string;
}

export default function LoyaltyClaimButton({ benefitKey, locale }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const label = locale === 'fr' ? 'Activer' : 'Activate';
  const successMsg = locale === 'fr' ? 'Demande envoyée !' : 'Request sent!';
  const errorMsg = locale === 'fr' ? 'Erreur, réessayez.' : 'Error, please try again.';

  const handleClaim = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefitKey }),
      });
      if (res.ok) {
        toast({ title: successMsg, variant: 'success' });
        router.refresh();
      } else {
        const data = await res.json();
        toast({ title: data.error === 'Already claimed' ? (locale === 'fr' ? 'Déjà réclamé' : 'Already claimed') : errorMsg, variant: 'destructive' });
      }
    } catch {
      toast({ title: errorMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-60 transition-colors"
    >
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}
