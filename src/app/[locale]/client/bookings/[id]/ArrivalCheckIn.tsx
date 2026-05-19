'use client';

// "Je suis arrivé" button — visible on CONFIRMED bookings starting within
// ~36 h.  Captures the client's geolocation, asks the server to verify
// proximity to the pension, and on success shows a calming "On vous
// attend" banner while the founder gets an SMS to prep the welcome.
//
// Feature #7 of the world features audit (2026-05-19) — "Geofencing
// arrivée check-in automatique" : effet 'ils m'attendent'.

import { useState } from 'react';
import { MapPin, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  bookingId: string;
  petName: string | null;
  locale: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'sending' }
  | { kind: 'arrived'; distance: number }
  | { kind: 'too_far'; distance: number }
  | { kind: 'error'; message: string };

export default function ArrivalCheckIn({ bookingId, petName, locale }: Props) {
  const fr = locale === 'fr';
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function checkIn() {
    if (!('geolocation' in navigator)) {
      setState({
        kind: 'error',
        message: fr ? 'Votre navigateur ne supporte pas la géolocalisation.' : 'Your browser does not support geolocation.',
      });
      return;
    }

    setState({ kind: 'locating' });

    // 10 s timeout — GPS lock can take a while on cold start.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState({ kind: 'sending' });
        try {
          const r = await fetch(`/api/client/bookings/${bookingId}/arrival`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const j = await r.json();
          if (!r.ok) {
            const map: Record<string, string> = {
              BOOKING_NOT_CONFIRMED: fr ? 'Cette réservation n\'est pas confirmée.' : 'This booking is not confirmed.',
              TOO_EARLY: fr ? 'Trop tôt — revenez le jour de votre arrivée.' : 'Too early — come back on your arrival day.',
              TOO_LATE: fr ? 'La fenêtre d\'arrivée est passée.' : 'The arrival window has passed.',
              TOO_FAR: fr ? 'Vous êtes encore loin — réessayez en approchant.' : 'You are still far away — try again closer.',
              FEATURE_DISABLED: fr ? 'Fonctionnalité indisponible.' : 'Feature unavailable.',
            };
            setState({
              kind: 'error',
              message: map[j.error] ?? (fr ? 'Une erreur est survenue.' : 'An error occurred.'),
            });
            return;
          }
          if (j.isNear) {
            setState({ kind: 'arrived', distance: j.distanceMeters });
          } else {
            setState({ kind: 'too_far', distance: j.distanceMeters });
          }
        } catch {
          setState({
            kind: 'error',
            message: fr ? 'Erreur réseau — réessayez.' : 'Network error — retry.',
          });
        }
      },
      (err) => {
        const message = err.code === 1
          ? (fr ? 'Vous avez refusé la géolocalisation. Activez-la et réessayez.' : 'You denied geolocation. Enable it and retry.')
          : err.code === 3
            ? (fr ? 'Position non détectée — réessayez près d\'une fenêtre.' : 'Position not detected — try near a window.')
            : (fr ? 'Position indisponible.' : 'Position unavailable.');
        setState({ kind: 'error', message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  if (state.kind === 'arrived') {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 shadow-card">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-bold text-emerald-900">
              {fr ? `On vous attend ! 🐾` : `We're expecting you! 🐾`}
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              {fr
                ? `L'équipe Dog Universe prépare l'accueil${petName ? ` de ${petName}` : ''}.`
                : `The Dog Universe team is preparing${petName ? ` ${petName}'s` : ''} welcome.`}
            </p>
            <p className="text-xs text-emerald-700/80 mt-2">
              {fr
                ? `Vous êtes à ~${state.distance} m. À tout de suite !`
                : `You're ~${state.distance} m away. See you in a moment!`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[#C9A84C]/40 bg-gradient-to-br from-[#FFF9E8] to-white p-5 shadow-card">
      <div className="flex items-start gap-3 mb-3">
        <MapPin className="h-6 w-6 text-[#8B6914] shrink-0 mt-0.5" />
        <div>
          <p className="text-base font-bold text-[#2C2C2C]">
            {fr ? 'En chemin vers Dog Universe ?' : 'On your way to Dog Universe?'}
          </p>
          <p className="text-sm text-charcoal/70 mt-1">
            {fr
              ? 'Prévenez-nous en un clic — on prépare l\'accueil avant votre arrivée.'
              : 'Let us know in one tap — we\'ll prepare your welcome before you arrive.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={checkIn}
        disabled={state.kind === 'locating' || state.kind === 'sending'}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] disabled:opacity-60 text-white font-medium transition-colors"
      >
        {state.kind === 'locating' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state.kind === 'sending'  && <Loader2 className="h-4 w-4 animate-spin" />}
        {state.kind === 'idle'     && <MapPin className="h-4 w-4" />}
        {state.kind === 'locating'
          ? (fr ? 'Détection…' : 'Locating…')
          : state.kind === 'sending'
            ? (fr ? 'Envoi…' : 'Sending…')
            : (fr ? 'Je suis arrivé' : "I've arrived")}
      </button>
      {state.kind === 'too_far' && (
        <p className="text-xs text-amber-700 mt-3 text-center">
          {fr
            ? `Vous êtes à ~${(state.distance / 1000).toFixed(1)} km — réessayez en approchant.`
            : `You're ~${(state.distance / 1000).toFixed(1)} km away — try again closer.`}
        </p>
      )}
      {state.kind === 'error' && (
        <p className="text-xs text-red-700 mt-3 text-center">{state.message}</p>
      )}
    </div>
  );
}
