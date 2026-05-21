import { formatMAD } from '@/lib/utils';

interface BillingKpisProps {
  locale: string;
  /** Engagement : Σ Invoice.amount des factures du mois (base AR). */
  kpiTotalBilled: number;
  /** Caisse (Sémantique B) : cash réellement encaissé ce mois (paymentDate). */
  kpiCollected: number;
  /** AR : Σ paidAmount (cumul tous mois) sur les factures du mois. */
  kpiSettled: number;
  /** AR : impayé réel = Σ(amount − paidAmount) sur les factures du mois. */
  kpiRemaining: number;
  invoiceCount: number;
}

/**
 * 3 KPI — deux bases comptables clairement séparées (audit 2026-05-21) :
 *   • « Encaissé ce mois » = CAISSE (cash reçu ce mois, réconcilie la banque).
 *   • « Facturé » + « Reste à encaisser » = ENGAGEMENT/AR sur les factures du
 *     mois (Facturé = Réglé + Reste).
 * On ne divise jamais la caisse par l'engagement : l'ancien « % du facturé »
 * comparait deux bases incompatibles → ratio trompeur, supprimé. Le seul
 * ratio affiché (% réglé) est calculé sur le MÊME ensemble (Réglé / Facturé).
 */
export function BillingKpis({
  locale,
  kpiTotalBilled,
  kpiCollected,
  kpiSettled,
  kpiRemaining,
  invoiceCount,
}: BillingKpisProps) {
  const isFr = locale === 'fr';
  const pctSettled = kpiTotalBilled > 0 ? Math.round((kpiSettled / kpiTotalBilled) * 100) : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[rgba(196,151,74,0.12)] rounded-xl overflow-hidden border border-[rgba(196,151,74,0.2)]">
      {/* Encaissé ce mois — CAISSE (réconcilie le relevé bancaire) */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Encaissé ce mois' : 'Collected this month'}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#C4974A]">{formatMAD(kpiCollected)}</p>
        <p className="text-xs text-[#8A7E75] mt-1">
          {isFr ? 'caisse · rentrées du mois' : 'cash · received this month'}
        </p>
      </div>
      {/* Facturé — ENGAGEMENT (montant des factures du mois) */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Facturé ce mois' : 'Billed this month'}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#2A2520]">{formatMAD(kpiTotalBilled)}</p>
        <p className="text-xs text-[#8A7E75] mt-1">{invoiceCount} {isFr ? 'facture(s)' : 'invoice(s)'}</p>
      </div>
      {/* Reste à encaisser — AR : impayé réel sur les factures du mois */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Reste à encaisser' : 'Outstanding'}
        </p>
        <p className={`mt-1 text-2xl font-bold ${kpiRemaining > 0 ? 'text-[#B45309]' : 'text-[#1A7A45]'}`}>
          {formatMAD(kpiRemaining)}
        </p>
        <p className="text-xs text-[#8A7E75] mt-1">
          {kpiRemaining <= 0
            ? (isFr ? 'Factures du mois soldées' : 'Month invoices settled')
            : pctSettled !== null
              ? `${pctSettled}% ${isFr ? 'du facturé déjà réglé' : 'of billed already settled'}`
              : '—'}
        </p>
      </div>
    </div>
  );
}
