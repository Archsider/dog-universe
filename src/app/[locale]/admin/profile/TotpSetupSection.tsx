'use client';
import { useState } from 'react';

type Step = 'idle' | 'password-setup' | 'qr' | 'disable';

const ERROR_LABELS: Record<string, string> = {
  INVALID_PASSWORD: 'Mot de passe incorrect',
  INVALID_TOKEN: 'Code incorrect ou expiré',
  REPLAY: 'Code déjà utilisé, attendez le prochain',
  CURRENT_TOKEN_REQUIRED: 'Code TOTP actuel requis pour la rotation',
  PASSWORD_REQUIRED: 'Mot de passe requis',
};

function label(err: string) {
  return ERROR_LABELS[err] ?? err;
}

export function TotpSetupSection({ totpEnabled: initialEnabled }: { totpEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>('idle');
  const [qrCodeDataURL, setQrCodeDataURL] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentToken, setCurrentToken] = useState(''); // for rotation
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep('idle');
    setPassword('');
    setToken('');
    setCurrentToken('');
    setError('');
    setLoading(false);
  }

  async function startSetup() {
    if (!password) { setError('Mot de passe requis'); return; }
    if (enabled && !/^\d{6}$/.test(currentToken)) {
      setError('Code TOTP actuel requis pour la rotation');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, string> = { password };
      if (enabled) body.token = currentToken;
      const res = await fetch('/api/auth/totp/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'UNKNOWN');
      setQrCodeDataURL(data.qrCodeDataURL);
      setToken('');
      setStep('qr');
    } catch (e: unknown) {
      setError(label(e instanceof Error ? e.message : 'Erreur'));
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    if (!/^\d{6}$/.test(token)) { setError('Code à 6 chiffres requis'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp/verify-setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'UNKNOWN');
      setEnabled(true);
      reset();
    } catch (e: unknown) {
      setError(label(e instanceof Error ? e.message : 'Erreur'));
    } finally {
      setLoading(false);
    }
  }

  async function disableTotp() {
    if (!password) { setError('Mot de passe requis'); return; }
    if (!/^\d{6}$/.test(token)) { setError('Code à 6 chiffres requis'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'UNKNOWN');
      setEnabled(false);
      reset();
    } catch (e: unknown) {
      setError(label(e instanceof Error ? e.message : 'Erreur'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Authentification à deux facteurs</h3>
          <p className="text-sm text-gray-500">
            Sécurisez votre compte avec une application TOTP (Google Authenticator, Authy…)
          </p>
        </div>
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
            ✓ Activée
          </span>
        ) : (
          <span className="text-sm text-gray-400">Désactivée</span>
        )}
      </div>

      {/* ── Idle ── */}
      {step === 'idle' && !enabled && (
        <button
          onClick={() => setStep('password-setup')}
          className="px-4 py-2 bg-[#D4AF37] text-[#141428] font-medium rounded-lg hover:bg-yellow-500 text-sm"
        >
          Activer la 2FA
        </button>
      )}
      {step === 'idle' && enabled && (
        <button
          onClick={() => setStep('disable')}
          className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm"
        >
          Désactiver la 2FA
        </button>
      )}

      {/* ── Password step (before showing QR) ── */}
      {step === 'password-setup' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {enabled
              ? 'Entrez votre mot de passe et le code TOTP actuel pour remplacer votre clé :'
              : 'Confirmez votre mot de passe pour continuer :'}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !enabled && startSetup()}
              placeholder="••••••••"
              autoFocus
              className="w-64 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none text-sm"
            />
          </div>
          {enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code TOTP actuel (pour rotation)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={currentToken}
                onChange={e => setCurrentToken(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-40 text-center text-xl tracking-widest border rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={startSetup}
              disabled={loading || !password || (enabled && currentToken.length !== 6)}
              className="px-4 py-2 bg-[#D4AF37] text-[#141428] font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-50 text-sm"
            >
              {loading ? 'Chargement…' : 'Continuer'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── QR + confirm ── */}
      {step === 'qr' && qrCodeDataURL && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Scannez ce QR code avec votre application d&apos;authentification :
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCodeDataURL} alt="QR Code 2FA" className="w-48 h-48 border rounded-lg" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code de confirmation
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && token.length === 6 && confirmSetup()}
              placeholder="000000"
              autoFocus
              className="w-40 text-center text-xl tracking-widest border rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={confirmSetup}
              disabled={loading || token.length !== 6}
              className="px-4 py-2 bg-[#D4AF37] text-[#141428] font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-50 text-sm"
            >
              {loading ? 'Vérification…' : 'Confirmer'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Disable ── */}
      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Entrez votre mot de passe et un code TOTP pour confirmer la désactivation :
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-64 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code TOTP</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && token.length === 6 && disableTotp()}
              placeholder="000000"
              className="w-40 text-center text-xl tracking-widest border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={disableTotp}
              disabled={loading || !password || token.length !== 6}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
            >
              {loading ? '…' : 'Désactiver'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
