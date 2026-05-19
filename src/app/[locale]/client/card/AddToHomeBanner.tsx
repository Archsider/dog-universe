'use client';

// "Ajouter à l'écran d'accueil" — iOS-aware install hint.  Detects whether
// the page is already running in PWA standalone mode and, if not, shows
// platform-specific instructions.  The user can dismiss for 30 days
// (localStorage flag).

import { useEffect, useState } from 'react';
import { Smartphone, Share, X } from 'lucide-react';

interface Props {
  locale: string;
}

const DISMISS_KEY = 'mcwallet:dismissed-until';
const DISMISS_DAYS = 30;

export default function AddToHomeBanner({ locale }: Props) {
  const fr = locale === 'fr';
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    // Skip if already installed (standalone PWA, iOS Safari, or
    // Android TWA).
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Honor dismiss-for-30-days
    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && parseInt(dismissedUntil, 10) > Date.now()) return;
    } catch { /* localStorage blocked — show anyway */ }

    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    setPlatform(isIos ? 'ios' : isAndroid ? 'android' : 'other');
    setShow(true);
  }, []);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 86_400_000;
    try { localStorage.setItem(DISMISS_KEY, String(until)); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 border border-[#D4AF37]/30 p-4">
      <div className="flex items-start gap-3">
        <Smartphone className="h-5 w-5 text-[#D4AF37] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#D4AF37]">
            {fr ? 'Ajoutez la carte à votre écran d\'accueil' : 'Add the card to your home screen'}
          </p>
          <p className="text-xs text-[#D4AF37]/70 mt-1">
            {fr
              ? 'Un clic depuis votre téléphone, comme une carte de fidélité.'
              : 'One tap from your phone, like a loyalty card.'}
          </p>

          {platform === 'ios' && (
            <div className="mt-3 text-xs text-[#D4AF37]/80 space-y-1.5">
              <p className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[10px] font-bold">1</span>
                {fr ? (<>Touchez l&apos;icône <Share className="inline h-3.5 w-3.5 mx-0.5" /> de Safari</>) : (<>Tap the Safari <Share className="inline h-3.5 w-3.5 mx-0.5" /> icon</>)}
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[10px] font-bold">2</span>
                {fr ? 'Choisissez "Sur l\'écran d\'accueil"' : 'Choose "Add to Home Screen"'}
              </p>
            </div>
          )}

          {platform === 'android' && (
            <div className="mt-3 text-xs text-[#D4AF37]/80 space-y-1.5">
              <p className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[10px] font-bold">1</span>
                {fr ? 'Ouvrez le menu de Chrome (⋮ en haut à droite)' : 'Open the Chrome menu (⋮ top right)'}
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[10px] font-bold">2</span>
                {fr ? 'Touchez "Ajouter à l\'écran d\'accueil"' : 'Tap "Add to Home screen"'}
              </p>
            </div>
          )}

          {platform === 'other' && (
            <p className="mt-3 text-xs text-[#D4AF37]/80">
              {fr
                ? 'Ouvrez cette page sur votre téléphone, puis utilisez le menu du navigateur "Ajouter à l\'écran d\'accueil".'
                : 'Open this page on your phone, then use the browser menu "Add to Home screen".'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={fr ? 'Fermer' : 'Dismiss'}
          className="shrink-0 text-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
