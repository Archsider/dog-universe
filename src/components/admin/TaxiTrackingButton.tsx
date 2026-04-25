'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Square, Copy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  taxiTripId: string;
  tripType: string;
  status: string;
  trackingActive: boolean;
  trackingToken: string | null;
  locale?: string;
}

const TRACKABLE_STATUSES = new Set([
  'EN_ROUTE_TO_CLIENT',
  'ON_SITE_CLIENT',
  'ANIMAL_ON_BOARD',
]);

const GPS_INTERVAL_MS = 5000;

export default function TaxiTrackingButton({
  taxiTripId,
  status,
  trackingActive,
  trackingToken,
  locale = 'fr',
}: Props) {
  const router = useRouter();
  const isFr = locale !== 'en';
  const [busy, setBusy] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Démarre / arrête le polling GPS quand trackingActive change
  useEffect(() => {
    if (!trackingActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({
        title: isFr ? 'Géolocalisation non disponible' : 'Geolocation unavailable',
        variant: 'destructive',
      });
      return;
    }

    const pushLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'location',
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
                accuracy: pos.coords.accuracy,
              }),
            });
          } catch {
            /* erreur réseau silencieuse — la prochaine tentative dans 5s */
          }
        },
        () => { /* permission refusée — silencieux, l'admin peut arrêter */ },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 4500 },
      );
    };

    pushLocation(); // premier point immédiat
    intervalRef.current = setInterval(pushLocation, GPS_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [trackingActive, taxiTripId, isFr]);

  // Composant invisible si le statut n'est pas un état de course en cours
  if (!TRACKABLE_STATUSES.has(status)) return null;

  const handleStart = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Suivi GPS démarré' : 'GPS tracking started', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Suivi GPS arrêté' : 'GPS tracking stopped', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const trackUrl = trackingToken ? `${window.location.origin}/${locale}/track/${trackingToken}` : '';

  const handleCopy = async () => {
    if (!trackUrl) return;
    try {
      await navigator.clipboard.writeText(trackUrl);
      toast({ title: isFr ? 'Lien copié !' : 'Link copied!', variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Échec de la copie' : 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {!trackingActive ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          <span>📍 {isFr ? 'Démarrer le suivi' : 'Start tracking'}</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleStop}
            disabled={busy}
            className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border border-red-500 text-red-600 hover:bg-red-500 hover:text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            <span>⏹ {isFr ? 'Arrêter le suivi' : 'Stop tracking'}</span>
          </button>

          {trackingToken && (
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
          )}
        </>
      )}
    </div>
  );
}
