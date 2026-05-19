'use client';

// Public client component for lifetime contract signing.  No portal auth —
// the HMAC token in the URL is the auth.  Mobile-first : reuses the
// existing SignaturePad (finger-drawing on touch devices).

import { useEffect, useState } from 'react';
import { SignaturePad } from '@/components/contract/SignaturePad';

interface Article {
  title: string;
  text: string;
}

interface Props {
  token: string;
  alreadySigned: boolean;
  signedAt: string | null;
  clientName: string;
  dogName: string;
  dogDescription: string;
  dogGender: string;
  articles: Article[];
}

type State =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'submitting' }
  | { kind: 'done'; downloadUrl: string | null; signedAt: string }
  | { kind: 'error'; message: string };

export function LifetimeSignClient(props: Props) {
  const [signature, setSignature] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [accepted, setAccepted] = useState(false);

  // If the contract was already signed when the page loaded, fetch the
  // download URL immediately so the owner can re-download their copy.
  useEffect(() => {
    if (!props.alreadySigned) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/contracts/lifetime/${props.token}/download`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok && j.downloadUrl) {
          setState({
            kind: 'done',
            downloadUrl: j.downloadUrl,
            signedAt: props.signedAt ?? new Date().toISOString(),
          });
        } else {
          setState({
            kind: 'done',
            downloadUrl: null,
            signedAt: props.signedAt ?? new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            kind: 'done',
            downloadUrl: null,
            signedAt: props.signedAt ?? new Date().toISOString(),
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [props.alreadySigned, props.signedAt, props.token]);

  async function handleSubmit() {
    if (!signature) {
      setState({ kind: 'error', message: 'Merci de signer dans le cadre avant de valider.' });
      return;
    }
    if (!accepted) {
      setState({ kind: 'error', message: 'Vous devez confirmer avoir lu et accepté les termes.' });
      return;
    }
    setState({ kind: 'submitting' });
    try {
      const r = await fetch(`/api/contracts/lifetime/${props.token}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl: signature }),
      });
      const j = await r.json();
      if (!r.ok) {
        const map: Record<string, string> = {
          INVALID_TOKEN: 'Lien invalide.',
          SIGNATURE_EMPTY: 'Signature vide — veuillez signer avant de valider.',
          SIGNATURE_TOO_LARGE: 'Signature trop volumineuse — veuillez réessayer.',
          INVALID_SIGNATURE: 'Signature invalide — veuillez réessayer.',
          ALREADY_SIGNED: 'Ce contrat a déjà été signé.',
          EXPIRED: 'Ce lien a expiré. Demandez un nouveau lien à Dog Universe.',
          REVOKED: 'Ce lien a été annulé par Dog Universe.',
          PDF_GENERATION_FAILED: 'Erreur lors de la génération du PDF. Réessayez ou contactez Dog Universe.',
          STORAGE_UPLOAD_FAILED: 'Erreur lors de l\'enregistrement. Réessayez.',
        };
        setState({
          kind: 'error',
          message: map[j.error] ?? 'Une erreur est survenue. Veuillez réessayer.',
        });
        return;
      }
      setState({
        kind: 'done',
        downloadUrl: j.downloadUrl ?? null,
        signedAt: j.signedAt ?? new Date().toISOString(),
      });
    } catch {
      setState({
        kind: 'error',
        message: 'Erreur réseau — vérifiez votre connexion et réessayez.',
      });
    }
  }

  if (state.kind === 'done') {
    const signedAtStr = new Date(state.signedAt).toLocaleString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-card border border-[#F0D98A]/40 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 p-6 border-b border-emerald-200 text-center">
          <p className="text-5xl mb-2" aria-hidden="true">✓</p>
          <h1 className="text-2xl font-bold text-emerald-900">Contrat signé</h1>
          <p className="text-sm text-emerald-800 mt-1">Signé le {signedAtStr}</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Merci {props.clientName.split(' ')[0]} ! Votre contrat de pension à vie pour <strong>{props.dogName}</strong> est officiellement enregistré.
          </p>
          {state.downloadUrl ? (
            <a
              href={state.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] text-white font-medium transition-colors"
            >
              📄 Télécharger le PDF signé
            </a>
          ) : (
            <p className="text-xs text-gray-500">
              Le PDF est en cours de génération. Rafraîchissez la page dans un instant pour le télécharger.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Une copie a été enregistrée dans nos systèmes. Dog Universe peut vous la renvoyer à tout moment sur demande.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-card border border-[#F0D98A]/40 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#C9A84C] to-[#B8960C] p-5 text-white">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Contrat de pension à vie</h1>
        <p className="text-sm opacity-90">DOG UNIVERSE — Marrakech</p>
      </div>

      <div className="p-5 sm:p-6">
        {/* Identity box */}
        <div className="bg-[#FFF9E8] border border-[#F0D98A] rounded-lg p-4 mb-5">
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 w-24">Propriétaire :</span>
              <span className="text-gray-900">{props.clientName}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 w-24">Animal :</span>
              <span className="text-gray-900">{props.dogName} ({props.dogGender})</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 w-24">Description :</span>
              <span className="text-gray-900">{props.dogDescription}</span>
            </div>
          </div>
        </div>

        {/* Articles */}
        <div className="space-y-3 mb-5 max-h-[420px] overflow-y-auto pr-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
          {props.articles.map((a, idx) => (
            <div key={idx}>
              <h2 className="font-semibold text-sm text-charcoal mb-1">{a.title}</h2>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{a.text}</p>
            </div>
          ))}
        </div>

        {/* Acceptance checkbox */}
        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 text-[#C9A84C] focus:ring-[#C9A84C] rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            <strong>J&apos;ai lu et j&apos;accepte sans réserve</strong> les conditions ci-dessus.
          </span>
        </label>

        {/* Signature pad */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Votre signature</p>
          <SignaturePad
            onSigned={(dataUrl) => {
              setSignature(dataUrl);
              if (state.kind === 'error') setState({ kind: 'idle' });
            }}
            onCleared={() => setSignature(null)}
          />
        </div>

        {state.kind === 'error' && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {state.message}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={state.kind === 'submitting' || !signature || !accepted}
          className="w-full px-5 py-3 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          {state.kind === 'submitting' ? 'Signature en cours…' : 'Signer le contrat'}
        </button>
        <p className="text-xs text-gray-500 mt-3 text-center">
          En signant, vous acceptez les conditions ci-dessus. Un PDF signé vous sera proposé immédiatement.
        </p>
      </div>
    </div>
  );
}
