'use client';

// Share Pet Health Passport — generates an HMAC token, displays a copy-able
// link + QR code in a modal. Default TTL 24h, slider 1h / 24h / 72h.
//
// Used on the client-facing pet detail page (/client/pets/[id]) and on the
// admin pet detail page (/admin/animals/[id]) — both are owner / staff
// authorised endpoints for POST /api/pets/[id]/passport.

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Check, X, Loader2, Clock } from 'lucide-react';

interface Props {
  petId: string;
  petName: string;
  locale: 'fr' | 'en';
  variant?: 'primary' | 'ghost';
}

interface IssuedToken {
  url: string;
  expiresAt: string;
  expiresInMs: number;
}

const L = {
  fr: {
    cta: 'Partager le carnet',
    title: 'Partager le carnet de santé',
    subtitle: 'Crée un lien temporaire à donner à un véto, un dog-sitter ou un membre de la famille.',
    duration: 'Validité du lien',
    duration1h: '1 h',
    duration24h: '24 h',
    duration72h: '3 jours',
    generate: 'Générer le lien',
    generating: 'Création…',
    yourLink: 'Lien à partager',
    copy: 'Copier',
    copied: 'Copié !',
    expiresIn: 'Expire dans',
    close: 'Fermer',
    error: 'Erreur — impossible de créer le lien',
    qrTip: 'Scannez le QR pour ouvrir sur un autre appareil.',
  },
  en: {
    cta: 'Share passport',
    title: 'Share Health Passport',
    subtitle: 'Create a temporary link to share with a vet, a sitter or a family member.',
    duration: 'Link validity',
    duration1h: '1 h',
    duration24h: '24 h',
    duration72h: '3 days',
    generate: 'Generate link',
    generating: 'Creating…',
    yourLink: 'Shareable link',
    copy: 'Copy',
    copied: 'Copied!',
    expiresIn: 'Expires in',
    close: 'Close',
    error: 'Error — could not generate link',
    qrTip: 'Scan the QR to open on another device.',
  },
} as const;

function formatRemaining(ms: number, locale: 'fr' | 'en'): string {
  const hours = Math.round(ms / 3_600_000);
  if (locale === 'fr') {
    if (hours < 1) return 'moins d\'une heure';
    if (hours === 1) return '1 heure';
    if (hours < 24) return `${hours} heures`;
    const days = Math.round(hours / 24);
    return days === 1 ? '1 jour' : `${days} jours`;
  }
  if (hours < 1) return 'less than an hour';
  if (hours === 1) return '1 hour';
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function SharePassportButton({ petId, petName, locale, variant = 'primary' }: Props) {
  const l = L[locale];
  const [open, setOpen] = useState(false);
  const [ttlHours, setTtlHours] = useState<1 | 24 | 72>(24);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/pets/${petId}/passport`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ttlHours }),
      });
      if (!r.ok) {
        setError(l.error);
        return;
      }
      const j = await r.json();
      setIssued({ url: j.url, expiresAt: j.expiresAt, expiresInMs: j.expiresInMs });
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
    } catch {
      /* ignore — fallback: user selects and copies manually */
    }
  }

  function reset() {
    setOpen(false);
    setIssued(null);
    setCopied(false);
    setError(null);
  }

  const btnClass = variant === 'primary'
    ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C4974A] hover:bg-[#A8823F] text-white text-sm font-medium transition-colors shadow-sm'
    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C4974A]/40 text-[#C4974A] hover:bg-[#C4974A]/10 text-sm transition-colors';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        <Share2 className="h-4 w-4" />
        {l.cta}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-passport-title"
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={reset}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 id="share-passport-title" className="font-serif text-lg font-bold text-[#2A2520]">
                {l.title}
              </h3>
              <button
                type="button"
                onClick={reset}
                aria-label={l.close}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!issued ? (
                <>
                  <p className="text-sm text-[#8A7E75]">
                    {l.subtitle.replace('un véto', `un véto pour ${petName}`).replace('a vet', `a vet for ${petName}`)}
                  </p>

                  <div>
                    <label className="block text-xs uppercase tracking-wide text-[#8A7E75] mb-2">
                      <Clock className="inline h-3 w-3 mr-1" />
                      {l.duration}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 24, 72] as const).map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setTtlHours(h)}
                          className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                            ttlHours === h
                              ? 'border-[#C4974A] bg-[#C4974A]/10 text-[#C4974A]'
                              : 'border-gray-200 text-gray-600 hover:border-[#C4974A]/40'
                          }`}
                        >
                          {h === 1 ? l.duration1h : h === 24 ? l.duration24h : l.duration72h}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="button"
                    onClick={generate}
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#C4974A] hover:bg-[#A8823F] disabled:opacity-60 text-white text-sm font-medium transition-colors"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    {busy ? l.generating : l.generate}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center bg-[#FAF6F0] rounded-2xl p-4">
                    <QRCodeSVG
                      value={issued.url}
                      size={160}
                      bgColor="#FAF6F0"
                      fgColor="#2A2520"
                      level="M"
                    />
                    <p className="text-xs text-[#8A7E75] mt-3 text-center">{l.qrTip}</p>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wide text-[#8A7E75] mb-1.5">
                      {l.yourLink}
                    </label>
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
                  </div>

                  <p className="text-xs text-center text-[#8A7E75]">
                    {l.expiresIn} <span className="font-medium text-[#C4974A]">{formatRemaining(issued.expiresInMs, locale)}</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
