'use client';

// Admin-side panel on the client detail page : generate / share / track
// the lifetime contract magic link.  Visible only when the client owns a
// permanent-resident pet.

import { useState } from 'react';

interface ExistingContract {
  id: string;
  status: 'PENDING' | 'SIGNED' | 'EXPIRED' | 'REVOKED';
  signedAt: string | null;
  publicToken: string | null;
  publicTokenExpiresAt: string | null;
  petName: string;
}

interface Props {
  clientId: string;
  petName: string;
  locale: string;
  existing: ExistingContract | null;
  /** Base URL (e.g. https://doguniverse.ma) for building the share link. */
  baseUrl: string;
  /** Admin signed-URL for downloading an already-signed PDF, if any. */
  initialDownloadUrl: string | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'generated'; signUrl: string; whatsappUrl: string | null; expiresAt: string }
  | { kind: 'error'; message: string };

export function LifetimeContractPanel(props: Props) {
  const fr = props.locale === 'fr';
  const [state, setState] = useState<State>(() => {
    if (props.existing?.status === 'PENDING' && props.existing.publicToken) {
      return {
        kind: 'generated',
        signUrl: `${props.baseUrl}/en/contracts/lifetime/${props.existing.publicToken}`,
        whatsappUrl: null,
        expiresAt: props.existing.publicTokenExpiresAt ?? '',
      };
    }
    return { kind: 'idle' };
  });
  const [copied, setCopied] = useState(false);

  const isSigned = props.existing?.status === 'SIGNED';

  async function handleGenerate() {
    setState({ kind: 'generating' });
    try {
      const r = await fetch(`/api/admin/contracts/lifetime/${props.clientId}/generate-link`, {
        method: 'POST',
      });
      const j = await r.json();
      if (!r.ok) {
        setState({ kind: 'error', message: j.error ?? 'UNKNOWN_ERROR' });
        return;
      }
      setState({
        kind: 'generated',
        signUrl: j.signUrl,
        whatsappUrl: j.whatsappUrl ?? null,
        expiresAt: j.expiresAt,
      });
    } catch {
      setState({ kind: 'error', message: 'NETWORK_ERROR' });
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback : show prompt for manual copy
      window.prompt(fr ? 'Copier ce lien :' : 'Copy this link:', url);
    }
  }

  // ── Already signed : show download + regenerate option ──────────────
  if (isSigned && props.existing) {
    const signedAtStr = props.existing.signedAt
      ? new Date(props.existing.signedAt).toLocaleString(fr ? 'fr-FR' : 'en-GB', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '';
    return (
      <div className="mt-3 pt-3 border-t border-violet-100 space-y-2">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-sm font-semibold text-emerald-900 mb-1">
            ✓ {fr ? 'Contrat signé' : 'Contract signed'}
          </p>
          <p className="text-xs text-emerald-800">
            {fr ? 'Signé le ' : 'Signed on '}{signedAtStr}
          </p>
          {props.initialDownloadUrl && (
            <a
              href={props.initialDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              📄 {fr ? 'Télécharger le PDF signé' : 'Download signed PDF'}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state.kind === 'generating'}
          className="text-xs text-violet-700 hover:text-violet-900 underline"
        >
          {state.kind === 'generating'
            ? (fr ? 'Génération…' : 'Generating…')
            : (fr ? 'Re-générer un nouveau lien (nouvelle version)' : 'Regenerate a new link (new version)')}
        </button>
        {state.kind === 'generated' && (
          <NewLinkDisplay
            fr={fr}
            signUrl={state.signUrl}
            whatsappUrl={state.whatsappUrl}
            copied={copied}
            onCopy={() => copyLink(state.signUrl)}
          />
        )}
      </div>
    );
  }

  // ── No contract or PENDING : show generate button + (if generated) link ──
  return (
    <div className="mt-3 pt-3 border-t border-violet-100 space-y-2">
      {state.kind !== 'generated' && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state.kind === 'generating'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {state.kind === 'generating'
            ? (fr ? '🏠 Génération…' : '🏠 Generating…')
            : (fr ? '🏠 Générer le lien de signature' : '🏠 Generate signing link')}
        </button>
      )}
      {state.kind === 'generated' && (
        <NewLinkDisplay
          fr={fr}
          signUrl={state.signUrl}
          whatsappUrl={state.whatsappUrl}
          copied={copied}
          onCopy={() => copyLink(state.signUrl)}
        />
      )}
      {state.kind === 'error' && (
        <p className="text-xs text-red-700">{fr ? 'Erreur : ' : 'Error: '}{state.message}</p>
      )}
      {props.existing?.status === 'PENDING' && state.kind !== 'generated' && (
        <p className="text-xs text-gray-500">
          {fr
            ? `Un lien est déjà actif pour ${props.petName}. Cliquer ci-dessus le remplace.`
            : `A link is already active for ${props.petName}. Clicking above replaces it.`}
        </p>
      )}
      <p className="text-[10px] text-gray-500">
        {fr
          ? 'Envoyez le lien au propriétaire — il signe avec le doigt sur son téléphone, le PDF signé est généré automatiquement.'
          : 'Send the link to the owner — they sign with their finger on their phone, the signed PDF is generated automatically.'}
      </p>
    </div>
  );
}

function NewLinkDisplay({
  fr, signUrl, whatsappUrl, copied, onCopy,
}: {
  fr: boolean;
  signUrl: string;
  whatsappUrl: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-900">
        {fr ? 'Lien de signature généré — valide 30 jours' : 'Signing link generated — valid 30 days'}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={signUrl}
          className="flex-1 min-w-0 text-xs px-2 py-1.5 bg-white border border-violet-200 rounded font-mono"
          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
        />
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded transition-colors"
        >
          {copied ? (fr ? '✓ Copié' : '✓ Copied') : (fr ? 'Copier' : 'Copy')}
        </button>
      </div>
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
        >
          💬 {fr ? 'Envoyer via WhatsApp' : 'Send via WhatsApp'}
        </a>
      )}
    </div>
  );
}
