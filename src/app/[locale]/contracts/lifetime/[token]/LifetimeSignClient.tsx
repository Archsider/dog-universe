'use client';

// Public signing UI — Stephanie reads the verbatim contract, ticks the
// acceptance box, signs with her finger / mouse, submits.  On success the
// signed PDF is generated server-side and a 1 h download URL is returned.
//
// English-only (signer is anglophone — US +1).

import { useEffect, useState } from 'react';
import { SignaturePad } from '@/components/contract/SignaturePad';
import type { ContractSection } from '@/lib/contract-pdf-lifetime-content';

interface Props {
  token: string;
  alreadySigned: boolean;
  signedAt: string | null;
  articles: ContractSection[];
}

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; downloadUrl: string | null; signedAt: string }
  | { kind: 'error'; message: string };

export function LifetimeSignClient(props: Props) {
  const [signature, setSignature] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!props.alreadySigned) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/contracts/lifetime/${props.token}/download`);
        const j = await r.json();
        if (cancelled) return;
        setState({
          kind: 'done',
          downloadUrl: r.ok ? (j.downloadUrl ?? null) : null,
          signedAt: props.signedAt ?? new Date().toISOString(),
        });
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
      setState({ kind: 'error', message: 'Please sign in the box before submitting.' });
      return;
    }
    if (!accepted) {
      setState({ kind: 'error', message: 'You must confirm you have read and accept the terms.' });
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
          INVALID_TOKEN: 'Invalid link.',
          SIGNATURE_EMPTY: 'Signature is empty — please draw your signature first.',
          SIGNATURE_TOO_LARGE: 'Signature image is too large — please try again.',
          INVALID_SIGNATURE: 'Invalid signature — please try again.',
          ALREADY_SIGNED: 'This agreement has already been signed.',
          EXPIRED: 'This link has expired. Please ask Dog Universe for a new one.',
          REVOKED: 'This link was cancelled by Dog Universe.',
          PDF_GENERATION_FAILED: 'PDF generation failed. Please retry or contact Dog Universe.',
          STORAGE_UPLOAD_FAILED: 'Upload failed. Please retry.',
        };
        setState({
          kind: 'error',
          message: map[j.error] ?? 'An error occurred. Please try again.',
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
        message: 'Network error — please check your connection and retry.',
      });
    }
  }

  if (state.kind === 'done') {
    const signedAtStr = new Date(state.signedAt).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-card border border-[#F0D98A]/40 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 p-6 border-b border-emerald-200 text-center">
          <p className="text-5xl mb-2" aria-hidden="true">✓</p>
          <h1 className="text-2xl font-bold text-emerald-900">Agreement signed</h1>
          <p className="text-sm text-emerald-800 mt-1">Signed on {signedAtStr}</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Thank you Stephanie — your Lifetime Boarding Agreement for <strong>Mama</strong> is officially on file.
          </p>
          {state.downloadUrl ? (
            <a
              href={state.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] text-white font-medium transition-colors"
            >
              📄 Download signed PDF
            </a>
          ) : (
            <p className="text-xs text-gray-500">
              Your PDF is being generated. Refresh in a moment to download it.
            </p>
          )}
          <p className="text-xs text-gray-500">
            A copy is stored securely on our side. Dog Universe can resend it to you at any time on request.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-card border border-[#F0D98A]/40 overflow-hidden">
      {/* Letterhead */}
      <div className="bg-gradient-to-r from-[#C9A84C] to-[#B8960C] px-6 py-5 text-white">
        <div className="text-[10px] tracking-[0.3em] opacity-80 mb-1">DOG UNIVERSE</div>
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Lifetime Boarding Agreement</h1>
        <p className="text-sm opacity-90 italic">Agreement for the Permanent Care of Mama</p>
      </div>

      <div className="p-5 sm:p-7">
        <p className="text-sm text-gray-700 mb-4">
          This Lifetime Boarding Agreement is entered into on <strong>May 18, 2026</strong> (the &quot;Effective Date&quot;), and supersedes and replaces the prior Care Agreement dated May 17, 2025.
        </p>

        {/* Parties */}
        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs font-bold text-gray-500 tracking-widest mb-1">BETWEEN</p>
            <div className="bg-[#FFF9E8] border-l-4 border-[#C9A84C] p-3 rounded-r">
              <p className="font-semibold text-charcoal">Dog Universe SARLAU (the &quot;Care Provider&quot;)</p>
              <p className="text-xs italic text-gray-600">A licensed pet boarding and care facility located in Marrakech, Morocco</p>
              <p className="text-xs text-gray-700 mt-1">Contact: +212 669-183981 — contact@doguniverse.ma</p>
              <p className="text-xs text-gray-700">Represented by: Mehdi Khtabe, Founder &amp; Director</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 tracking-widest mb-1">AND</p>
            <div className="bg-[#FFF9E8] border-l-4 border-[#C9A84C] p-3 rounded-r">
              <p className="font-semibold text-charcoal">Stephanie Yanik (the &quot;Owner&quot;)</p>
              <p className="text-xs text-gray-700 mt-1">Contact: +1 (248) 321-7653 — stephyanik@gmail.com</p>
            </div>
          </div>
          <p className="text-xs italic text-gray-500 text-center">(individually a &quot;Party&quot;, together the &quot;Parties&quot;)</p>
        </div>

        {/* Articles */}
        <div className="space-y-4 mb-5 max-h-[480px] overflow-y-auto pr-2 border border-gray-100 rounded-lg p-4 bg-gray-50">
          {props.articles.map((section, idx) => (
            <div key={idx}>
              <h2 className="font-bold text-sm text-charcoal mb-2">{section.title}</h2>
              <div className="space-y-1.5">
                {section.blocks.map((b, j) =>
                  b.kind === 'para' ? (
                    <p key={j} className="text-xs text-gray-700 leading-relaxed">{b.text}</p>
                  ) : (
                    <ul key={j} className="text-xs text-gray-700 leading-relaxed ml-4 list-disc space-y-0.5">
                      {b.items.map((it, k) => (
                        <li key={k}>{it}</li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Acceptance */}
        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 text-[#C9A84C] focus:ring-[#C9A84C] rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            <strong>I have read and accept</strong> the terms of this Lifetime Boarding Agreement in full.
          </span>
        </label>

        {/* Signature */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Your signature</p>
          <SignaturePad
            lang="en"
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
          {state.kind === 'submitting' ? 'Signing…' : 'Sign the Agreement'}
        </button>
        <p className="text-xs text-gray-500 mt-3 text-center">
          By signing, you accept the terms above. A signed PDF will be made available immediately.
        </p>
      </div>
    </div>
  );
}
