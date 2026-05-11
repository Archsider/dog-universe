import { formatMAD } from '@/lib/utils';

interface BillingKpisProps {
  locale: string;
  kpiTotalBilled: number;
  kpiCollected: number;
  kpiRemaining: number;
  invoiceCount: number;
}

export function BillingKpis({
  locale,
  kpiTotalBilled,
  kpiCollected,
  kpiRemaining,
  invoiceCount,
}: BillingKpisProps) {
  const isFr = locale === 'fr';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[rgba(196,151,74,0.12)] rounded-xl overflow-hidden border border-[rgba(196,151,74,0.2)]">
      {/* Total facturé */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Total facturé' : 'Total billed'}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#2A2520]">{formatMAD(kpiTotalBilled)}</p>
        <p className="text-xs text-[#8A7E75] mt-1">{invoiceCount} {isFr ? 'facture(s)' : 'invoice(s)'}</p>
      </div>
      {/* Total encaissé */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Total encaissé' : 'Total collected'}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#C4974A]">{formatMAD(kpiCollected)}</p>
        <p className="text-xs text-[#8A7E75] mt-1">
          {kpiTotalBilled > 0
            ? `${Math.round((kpiCollected / kpiTotalBilled) * 100)}% ${isFr ? 'du facturé' : 'of billed'}`
            : '—'}
        </p>
      </div>
      {/* Reste à encaisser */}
      <div className="bg-white px-6 py-5">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
          {isFr ? 'Reste à encaisser' : 'Outstanding'}
        </p>
        <p className={`mt-1 text-2xl font-bold ${kpiRemaining > 0 ? 'text-[#B45309]' : 'text-[#1A7A45]'}`}>
          {formatMAD(kpiRemaining)}
        </p>
        <p className="text-xs text-[#8A7E75] mt-1">
          {kpiRemaining <= 0
            ? (isFr ? 'Tout encaissé' : 'Fully collected')
            : (kpiTotalBilled > 0 ? `${Math.round((kpiRemaining / kpiTotalBilled) * 100)}% ${isFr ? 'restant' : 'remaining'}` : '—')}
        </p>
      </div>
    </div>
  );
}
