'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface ResendInvoiceButtonProps {
  invoiceId: string;
  locale: string;
}

export default function ResendInvoiceButton({ invoiceId, locale }: ResendInvoiceButtonProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fr = locale === 'fr';

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend`, { method: 'POST' });
      if (res.ok) {
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      onClick={handleResend}
      disabled={sending}
      title={fr ? 'Renvoyer notif + email au client' : 'Resend notification + email to client'}
      className={`p-1.5 rounded transition-colors ${
        sent
          ? 'text-green-500'
          : 'text-gray-400 hover:text-gold-600'
      } disabled:opacity-40`}
    >
      <Send className="h-4 w-4" />
    </button>
  );
}
