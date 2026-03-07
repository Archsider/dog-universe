'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatMAD } from '@/lib/utils';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Props {
  bookingId: string;
  clientId: string;
  serviceType: string;
  nights: number;
  petNames: string;
  boardingDetail?: {
    pricePerNight: number;
    includeGrooming: boolean;
    groomingPrice: number;
    taxiAddonPrice: number;
  } | null;
  taxiDetail?: {
    taxiType: string;
    price: number;
  } | null;
  locale: string;
}

const TAXI_TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  VET: 'Vétérinaire',
  AIRPORT: 'Aéroport',
};

function buildInitialItems(props: Props): InvoiceItem[] {
  const { serviceType, nights, petNames, boardingDetail, taxiDetail } = props;
  const items: InvoiceItem[] = [];

  if (serviceType === 'BOARDING' && boardingDetail) {
    items.push({
      description: `Pension ${petNames} — ${nights} nuit${nights > 1 ? 's' : ''}`,
      quantity: nights,
      unitPrice: boardingDetail.pricePerNight,
      total: boardingDetail.pricePerNight * nights,
    });
    if (boardingDetail.includeGrooming) {
      items.push({
        description: `Toilettage — ${petNames}`,
        quantity: 1,
        unitPrice: boardingDetail.groomingPrice,
        total: boardingDetail.groomingPrice,
      });
    }
    if (boardingDetail.taxiAddonPrice > 0) {
      items.push({
        description: 'Taxi animalier (aller/retour)',
        quantity: 1,
        unitPrice: boardingDetail.taxiAddonPrice,
        total: boardingDetail.taxiAddonPrice,
      });
    }
  } else if (serviceType === 'PET_TAXI' && taxiDetail) {
    const label = TAXI_TYPE_LABELS[taxiDetail.taxiType] ?? taxiDetail.taxiType;
    items.push({
      description: `Taxi animalier ${label} — ${petNames}`,
      quantity: 1,
      unitPrice: taxiDetail.price,
      total: taxiDetail.price,
    });
  }

  return items;
}

export default function CreateInvoiceFromBookingButton(props: Props) {
  const { bookingId, clientId, locale } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const router = useRouter();

  const isFr = locale !== 'en';

  const l = {
    btn: isFr ? 'Créer la facture' : 'Create invoice',
    title: isFr ? 'Créer la facture' : 'Create invoice',
    desc: isFr ? 'Vérifiez et ajustez les prix avant de générer.' : 'Review and adjust prices before generating.',
    cancel: isFr ? 'Annuler' : 'Cancel',
    confirm: isFr ? 'Générer la facture' : 'Generate invoice',
    success: isFr ? 'Facture créée' : 'Invoice created',
    error: isFr ? 'Erreur' : 'Error',
    total: isFr ? 'Total TTC' : 'Total',
    unitPrice: isFr ? 'Prix unitaire (MAD)' : 'Unit price (MAD)',
  };

  const handleOpen = () => {
    setItems(buildInitialItems(props));
    setOpen(true);
  };

  const updateUnitPrice = (index: number, value: string) => {
    const price = parseFloat(value) || 0;
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return { ...item, unitPrice: price, total: price * item.quantity };
    }));
  };

  const total = items.reduce((s, i) => s + i.total, 0);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, bookingId, items }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gold-500 hover:bg-gold-600 text-white rounded-lg font-medium transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {l.btn}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gold-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-gold-600" />
              </div>
              <div>
                <h2 className="text-lg font-serif font-bold text-charcoal">{l.title}</h2>
                <p className="text-xs text-gray-500">{l.desc}</p>
              </div>
            </div>

            <div className="border border-ivory-200 rounded-xl overflow-hidden mb-5">
              {/* Header */}
              <div className="bg-ivory-50 px-4 py-2 grid grid-cols-[1fr_48px_120px_80px] gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>Description</span>
                <span className="text-center">{isFr ? 'Qté' : 'Qty'}</span>
                <span className="text-right">{isFr ? 'P.U. (MAD)' : 'Unit (MAD)'}</span>
                <span className="text-right">Total</span>
              </div>

              {items.map((item, i) => (
                <div key={i} className="px-4 py-3 grid grid-cols-[1fr_48px_120px_80px] gap-2 border-t border-ivory-100 text-sm items-center">
                  <span className="text-charcoal text-xs">{item.description}</span>
                  <span className="text-center text-gray-500">{item.quantity}</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={item.unitPrice === 0 ? '' : item.unitPrice}
                    onChange={e => updateUnitPrice(i, e.target.value)}
                    placeholder="0"
                    className="border border-gray-200 rounded-lg px-2 py-1 text-right text-sm w-full focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                  <span className="text-right font-medium text-charcoal">{formatMAD(item.total)}</span>
                </div>
              ))}

              <div className="px-4 py-3 border-t border-[#F0D98A]/60 bg-ivory-50 flex justify-between items-center">
                <span className="text-sm font-bold text-charcoal">{l.total}</span>
                <span className="text-base font-bold text-gold-600">{formatMAD(total)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {l.cancel}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || items.length === 0 || total === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {l.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
