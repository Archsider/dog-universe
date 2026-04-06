'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Claim {
  id: string;
  clientId: string;
  grade: string;
  benefitKey: string;
  benefitLabelFr: string;
  benefitLabelEn: string;
  status: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  claimedAt: string;
  client: { id: string; name: string; email: string };
  reviewer: { name: string } | null;
}

interface Props {
  initialClaims: Claim[];
  locale: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};
const STATUS_LABELS: Record<string, Record<string, string>> = {
  PENDING: { fr: 'En attente', en: 'Pending' },
  APPROVED: { fr: 'Validé', en: 'Approved' },
  REJECTED: { fr: 'Refusé', en: 'Rejected' },
};

const GRADE_COLORS: Record<string, string> = {
  BRONZE: 'bg-[#C9956B]/10 text-[#8B5E3C]',
  SILVER: 'bg-[#9E9EC0]/10 text-[#4A4A6A]',
  GOLD: 'bg-[#D4AF37]/10 text-[#8B6914]',
  PLATINUM: 'bg-[#1C1C2E] text-[#D4AF37]',
};

export default function ClaimsManager({ initialClaims, locale }: Props) {
  const fr = locale === 'fr';
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = filter === 'ALL' ? claims : claims.filter((c) => c.status === filter);

  async function handleAction(id: string, action: 'APPROVED' | 'REJECTED') {
    if (action === 'REJECTED' && !rejectionReason.trim()) return;
    setLoading(id);
    try {
      const res = await fetch(`/api/admin/loyalty/claims/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejectionReason: rejectionReason.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setClaims((prev) => prev.map((c) => c.id === id ? { ...c, ...updated } : c));
        setRejecting(null);
        setRejectionReason('');
      }
    } finally {
      setLoading(null);
    }
  }

  const pendingCount = claims.filter((c) => c.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-charcoal text-white'
                : 'bg-white text-charcoal/60 border border-[#F0D98A]/40 hover:bg-ivory-50'
            }`}
          >
            {f === 'ALL' ? (fr ? 'Tous' : 'All') : STATUS_LABELS[f][locale] ?? STATUS_LABELS[f]['fr']}
            {f === 'PENDING' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-charcoal/40 text-sm">
          {fr ? 'Aucune réclamation' : 'No claims'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((claim) => (
            <div key={claim.id} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Client */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${GRADE_COLORS[claim.grade] ?? 'bg-gray-100 text-gray-600'}`}>
                      {claim.grade}
                    </span>
                    <span className="font-semibold text-charcoal text-sm">{claim.client.name}</span>
                    <span className="text-xs text-charcoal/40">{claim.client.email}</span>
                  </div>

                  {/* Benefit */}
                  <p className="text-sm text-charcoal font-medium">
                    {fr ? claim.benefitLabelFr : claim.benefitLabelEn}
                  </p>
                  <p className="text-xs text-charcoal/40 mt-0.5">
                    {fr ? 'Réclamé le' : 'Claimed'} {formatDate(new Date(claim.claimedAt), locale)}
                  </p>

                  {/* Rejection reason */}
                  {claim.status === 'REJECTED' && claim.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1 italic">
                      {fr ? 'Raison' : 'Reason'}: {claim.rejectionReason}
                    </p>
                  )}
                  {claim.reviewer && (
                    <p className="text-xs text-charcoal/30 mt-0.5">
                      {fr ? 'Traité par' : 'Reviewed by'} {claim.reviewer.name}
                    </p>
                  )}
                </div>

                {/* Status badge + actions */}
                <div className="flex-shrink-0 flex flex-col items-end gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${STATUS_STYLES[claim.status]}`}>
                    {claim.status === 'PENDING' && <Clock className="h-3 w-3" />}
                    {claim.status === 'APPROVED' && <CheckCircle className="h-3 w-3" />}
                    {claim.status === 'REJECTED' && <XCircle className="h-3 w-3" />}
                    {STATUS_LABELS[claim.status]?.[locale] ?? claim.status}
                  </span>

                  {claim.status === 'PENDING' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAction(claim.id, 'APPROVED')}
                        disabled={loading === claim.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium"
                      >
                        <CheckCircle className="h-3 w-3" />
                        {fr ? 'Valider' : 'Approve'}
                      </button>
                      <button
                        onClick={() => { setRejecting(claim.id); setRejectionReason(''); }}
                        disabled={loading === claim.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-medium"
                      >
                        <XCircle className="h-3 w-3" />
                        {fr ? 'Refuser' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Rejection reason input */}
              {rejecting === claim.id && (
                <div className="mt-3 pt-3 border-t border-[#F0D98A]/40">
                  <p className="text-xs text-charcoal/60 mb-1.5 font-medium">
                    {fr ? 'Raison du refus (obligatoire)' : 'Rejection reason (required)'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder={fr ? 'Ex: Avantage déjà utilisé cette année' : 'E.g. Benefit already used this year'}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold-400"
                    />
                    <button
                      onClick={() => handleAction(claim.id, 'REJECTED')}
                      disabled={!rejectionReason.trim() || loading === claim.id}
                      className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                    >
                      {fr ? 'Confirmer' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setRejecting(null)}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                    >
                      {fr ? 'Annuler' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
