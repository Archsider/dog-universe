'use client';

import { Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  trackingToken: string;
  locale: string;
  isFr: boolean;
}

/**
 * Display + copy button for the public tracking URL. Rendered only when
 * tracking is active and a token has been issued by the server.
 */
export function TrackingLinkCard({ trackingToken, locale, isFr }: Props) {
  const trackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/${locale}/track/${trackingToken}`
      : '';

  const handleCopy = async () => {
    if (!trackUrl) return;
    try {
      await navigator.clipboard.writeText(trackUrl);
      toast({
        title: isFr ? 'Lien copié !' : 'Link copied!',
        variant: 'success',
      });
    } catch {
      toast({
        title: isFr ? 'Échec de la copie' : 'Copy failed',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-lg border border-[rgba(196,151,74,0.3)] bg-[#FEFCF9] p-3 space-y-2">
      <p className="text-xs font-semibold text-[#8A7E75]">
        {isFr ? 'Lien client' : 'Client link'}
      </p>
      <p className="text-xs font-mono break-all text-[#2A2520] bg-white border border-[rgba(196,151,74,0.15)] rounded px-2 py-1.5">
        /{locale}/track/{trackingToken}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-md text-xs font-medium transition-all duration-200"
      >
        <Copy className="h-3 w-3" />
        {isFr ? 'Copier le lien' : 'Copy link'}
      </button>
    </div>
  );
}
