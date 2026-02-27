'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  invoiceId: string;
  currentStatus: string;
  locale: string;
}

export default function CreateInvoiceButton({ invoiceId, currentStatus, locale }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === 'PAID' || currentStatus === 'CANCELLED') return null;

  const markPaid = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: locale === 'fr' ? 'Facture marquée payée' : 'Invoice marked as paid', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: locale === 'fr' ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={markPaid} disabled={loading} className="p-1.5 text-gray-400 hover:text-green-600 rounded" title={locale === 'fr' ? 'Marquer comme payée' : 'Mark as paid'}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
    </button>
  );
}
