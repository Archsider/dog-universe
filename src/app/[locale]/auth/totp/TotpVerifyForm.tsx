'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

export function TotpVerifyForm() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update } = useSession();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(token)) {
      setError('Le code doit contenir 6 chiffres');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/totp/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === 'INVALID_TOKEN' ? 'Code incorrect. Réessayez.' : 'Erreur de validation.');
        return;
      }

      // Déclenche le renouvellement du JWT pour effacer totpPending
      await update();
      // P0: validate callbackUrl to prevent open redirect to external domains
      const rawCallbackUrl = searchParams.get('callbackUrl') ?? '';
      const callbackUrl = /^\/(fr|en)\//.test(rawCallbackUrl) ? rawCallbackUrl : '/fr/admin';
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Code à 6 chiffres
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={token}
          onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="w-full text-center text-2xl tracking-widest border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          autoFocus
          disabled={loading}
        />
      </div>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      <button
        type="submit"
        disabled={loading || token.length !== 6}
        className="w-full py-3 px-4 bg-[#D4AF37] hover:bg-yellow-500 disabled:opacity-50 text-[#141428] font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Vérification…' : 'Vérifier'}
      </button>
    </form>
  );
}
