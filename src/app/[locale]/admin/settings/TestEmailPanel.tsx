'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, CheckCircle, XCircle } from 'lucide-react';

export default function TestEmailPanel() {
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      setResult({ success: data.success, error: data.error });
    } catch {
      setResult({ success: false, error: 'Erreur réseau' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-6">
      <h2 className="text-lg font-serif font-semibold text-charcoal mb-1">Test d'envoi d'email</h2>
      <p className="text-sm text-gray-500 mb-4">Envoie un email de bienvenue test pour vérifier la configuration SMTP.</p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="destinataire@email.com"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="flex-1"
        />
        <Button onClick={handleTest} disabled={loading || !to.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Envoyer
        </Button>
      </div>
      {result && (
        <div className={`mt-3 flex items-center gap-2 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
          {result.success
            ? <><CheckCircle className="h-4 w-4" /> Email envoyé avec succès !</>
            : <><XCircle className="h-4 w-4" /> Échec : {result.error}</>}
        </div>
      )}
    </div>
  );
}
