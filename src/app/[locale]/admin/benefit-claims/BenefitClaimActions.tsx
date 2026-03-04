'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  claimId: string;
  locale: string;
}

export function BenefitClaimActions({ claimId, locale }: Props) {
  const isFr = locale !== 'en';
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  const t = isFr
    ? { approve: 'Approuver', reject: 'Refuser', note: 'Motif (optionnel)', confirm: 'Confirmer', cancel: 'Annuler' }
    : { approve: 'Approve', reject: 'Decline', note: 'Reason (optional)', confirm: 'Confirm', cancel: 'Cancel' };

  async function submit(status: 'APPROVED' | 'REJECTED') {
    setLoading(status === 'APPROVED' ? 'approve' : 'reject');
    try {
      await fetch(`/api/admin/benefit-claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: adminNote || undefined }),
      });
      router.refresh();
    } finally {
      setLoading(null);
      setShowNote(false);
    }
  }

  if (showNote) {
    return (
      <div className="flex flex-col gap-2 min-w-48">
        <input
          type="text"
          placeholder={t.note}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gold-400"
        />
        <div className="flex gap-1">
          <button
            onClick={() => submit('REJECTED')}
            disabled={loading === 'reject'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading === 'reject' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            {t.confirm}
          </button>
          <button
            onClick={() => { setShowNote(false); setAdminNote(''); }}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => submit('APPROVED')}
        disabled={loading !== null}
        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        {loading === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {t.approve}
      </button>
      <button
        onClick={() => setShowNote(true)}
        disabled={loading !== null}
        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {t.reject}
      </button>
    </div>
  );
}
