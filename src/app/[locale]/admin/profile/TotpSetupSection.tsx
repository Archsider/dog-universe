'use client';
import { useState } from 'react';

export function TotpSetupSection({ totpEnabled: initialEnabled }: { totpEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<'idle' | 'qr' | 'confirm' | 'disable'>('idle');
  const [qrCodeDataURL, setQrCodeDataURL] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQrCodeDataURL(data.qrCodeDataURL);
      setStep('qr');
    } catch {
      setError('Impossible de démarrer la configuration. Réessayez.');
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
      if (!res.ok) throw new Error(data.error === 'INVALID_TOKEN' ? 'Code incorrect' : data.error);
      setEnabled(true);
      setStep('idle');
      setToken('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function disableTotp() {
    if (!/^\d{6}$/.test(token)) { setError('Code à 6 chiffres requis'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === 'INVALID_TOKEN' ? 'Code incorrect' : data.error);
      setEnabled(false);
      setStep('idle');
      setToken('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Authentification à deux facteurs</h3>
          <p className="text-sm text-gray-500">Sécurisez votre compte avec une application TOTP (Google Authenticator, Authy…)</p>
        </div>
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
            ✓ Activée
          </span>
        ) : (
          <span className="text-sm text-gray-400">Désactivée</span>
        )}
      </div>

      {!enabled && step === 'idle' && (
        <button onClick={startSetup} disabled={loading}
          className="px-4 py-2 bg-[#D4AF37] text-[#141428] font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-50 text-sm">
          {loading ? 'Chargement…' : 'Activer la 2FA'}
        </button>
      )}

      {step === 'qr' && qrCodeDataURL && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Scannez ce QR code avec votre application d&apos;authentification :</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCodeDataURL} alt="QR Code 2FA" className="w-48 h-48 border rounded-lg" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code de confirmation</label>
            <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
              value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-40 text-center text-xl tracking-widest border rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={confirmSetup} disabled={loading || token.length !== 6}
              className="px-4 py-2 bg-[#D4AF37] text-[#141428] font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-50 text-sm">
              {loading ? 'Vérification…' : 'Confirmer'}
            </button>
            <button onClick={() => { setStep('idle'); setToken(''); setError(''); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {enabled && step === 'idle' && (
        <button onClick={() => setStep('disable')}
          className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm">
          Désactiver la 2FA
        </button>
      )}

      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Entrez un code de votre application pour confirmer la désactivation :</p>
          <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
            value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-40 text-center text-xl tracking-widest border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 focus:outline-none" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={disableTotp} disabled={loading || token.length !== 6}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
              {loading ? '…' : 'Désactiver'}
            </button>
            <button onClick={() => { setStep('idle'); setToken(''); setError(''); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
