'use client';

// Parrainage Royal — dashboard widget.
// Generates a magic link on demand (POST /api/referrals), shows the
// current Ambassador tier + perk progress + share controls (copy link
// + native share if available).

import { useState, useEffect } from 'react';
import { Crown, Share2, Copy, Check, Loader2 } from 'lucide-react';

interface Props {
  locale: 'fr' | 'en';
}

interface Issued { token: string; url: string }
interface Status { tier: 'none' | 'bronze' | 'silver' | 'gold'; rewarded: number; signedUp: number }

const L = {
  fr: {
    title: 'Parrainage Royal',
    subtitle: 'Invitez un ami, gagnez tous les deux.',
    generate: 'Créer mon lien magique',
    generating: 'Création…',
    yourLink: 'Votre lien à partager',
    copy: 'Copier',
    copied: 'Copié !',
    share: 'Partager',
    shareText: 'Découvrez Dog Universe à Marrakech — pension de luxe pour chiens et chats. Mon code parrain :',
    rewarded: 'parrainage·s récompensé·s',
    signedUp: 'en attente du 1er séjour',
    tierNone: 'Membre',
    tierBronze: 'Ambassadeur Bronze',
    tierSilver: 'Ambassadeur Argent',
    tierGold: 'Ambassadeur Or',
    nextTier: 'Encore',
    nextTierSuffix: 'pour passer',
    error: 'Erreur — réessayez',
  },
  en: {
    title: 'Royal Sponsorship',
    subtitle: 'Invite a friend, both of you win.',
    generate: 'Create my magic link',
    generating: 'Creating…',
    yourLink: 'Your shareable link',
    copy: 'Copy',
    copied: 'Copied!',
    share: 'Share',
    shareText: 'Discover Dog Universe in Marrakech — luxury boarding for dogs and cats. My sponsor link:',
    rewarded: 'rewarded sponsorships',
    signedUp: 'awaiting first stay',
    tierNone: 'Member',
    tierBronze: 'Bronze Ambassador',
    tierSilver: 'Silver Ambassador',
    tierGold: 'Gold Ambassador',
    nextTier: 'Just',
    nextTierSuffix: 'more to reach',
    error: 'Error — try again',
  },
} as const;

const TIER_STYLE: Record<Status['tier'], { bg: string; ring: string; fg: string; label: keyof typeof L.fr }> = {
  none:   { bg: 'bg-gray-50',                ring: 'ring-gray-200',                fg: 'text-gray-600', label: 'tierNone' },
  bronze: { bg: 'bg-amber-50',               ring: 'ring-amber-200',               fg: 'text-amber-700', label: 'tierBronze' },
  silver: { bg: 'bg-slate-50',               ring: 'ring-slate-300',               fg: 'text-slate-600', label: 'tierSilver' },
  gold:   { bg: 'bg-[#C4974A]/10',           ring: 'ring-[#C4974A]/40',            fg: 'text-[#C4974A]', label: 'tierGold' },
};

const NEXT_THRESHOLDS: Record<Status['tier'], number | null> = {
  none: 1, bronze: 3, silver: 6, gold: null,
};

export function ReferralWidget({ locale }: Props) {
  const l = L[locale];
  const [status, setStatus] = useState<Status | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch('/api/referrals')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!aborted && j?.badge) setStatus(j.badge); })
      .catch(() => undefined);
    return () => { aborted = true; };
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/referrals', { method: 'POST' });
      if (!r.ok) {
        setError(l.error);
        return;
      }
      const j = await r.json();
      setIssued({ token: j.token, url: j.url });
    } catch {
      setError(l.error);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued?.url) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function nativeShare() {
    if (!issued?.url) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Dog Universe', text: l.shareText, url: issued.url });
      } catch { /* user cancelled */ }
    } else {
      void copy();
    }
  }

  const tier = status?.tier ?? 'none';
  const style = TIER_STYLE[tier];
  const next = NEXT_THRESHOLDS[tier];
  const rewarded = status?.rewarded ?? 0;
  const stillNeeded = next != null ? Math.max(0, next - rewarded) : 0;
  const progressLabel: string | null = next == null || stillNeeded === 0
    ? null
    : `${l.nextTier} ${stillNeeded} ${l.nextTierSuffix} ${tier === 'none' ? l.tierBronze : tier === 'bronze' ? l.tierSilver : l.tierGold}`;

  return (
    <section className="rounded-2xl border border-[#C4974A]/30 bg-gradient-to-br from-white via-white to-[#FAF6F0] p-5 shadow-[0_6px_20px_rgba(196,151,74,0.08)]">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[2px] text-[#C4974A] font-semibold mb-1">
            <Crown className="h-3 w-3" />
            {l.title}
          </div>
          <h3 className="text-base font-serif font-bold text-[#2A2520] leading-tight">
            {l.subtitle}
          </h3>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ring-1 ${style.bg} ${style.ring} ${style.fg} shrink-0`}>
          {l[style.label]}
        </span>
      </header>

      {status && (status.rewarded > 0 || status.signedUp > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-[#C4974A]/10 p-3 text-center">
            <div className="text-xl font-serif font-bold text-[#C4974A]">{status.rewarded}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8A7E75] mt-0.5">{l.rewarded}</div>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <div className="text-xl font-serif font-bold text-[#2A2520]">{status.signedUp}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8A7E75] mt-0.5">{l.signedUp}</div>
          </div>
        </div>
      )}

      {progressLabel && (
        <p className="text-xs text-[#8A7E75] italic mb-3 text-center">{progressLabel}</p>
      )}

      {!issued ? (
        <>
          {error && <p className="text-xs text-red-600 mb-2 text-center">{error}</p>}
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#C4974A] hover:bg-[#A8823F] disabled:opacity-60 text-white text-sm font-medium transition-colors shadow-[0_6px_16px_rgba(196,151,74,0.3)]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
            {busy ? l.generating : l.generate}
          </button>
        </>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={issued.url}
              className="flex-1 px-3 py-2 text-xs font-mono bg-[#FAF6F0] border border-[#C4974A]/20 rounded-lg text-[#2A2520] truncate"
              onFocus={e => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C4974A] hover:bg-[#A8823F] text-white text-xs font-medium transition-colors shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? l.copied : l.copy}
            </button>
          </div>
          <button
            type="button"
            onClick={nativeShare}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[#C4974A]/40 text-[#C4974A] hover:bg-[#C4974A]/10 text-xs font-medium transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            {l.share}
          </button>
        </div>
      )}
    </section>
  );
}
