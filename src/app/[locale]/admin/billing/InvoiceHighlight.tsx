'use client';

import { useEffect } from 'react';

// Scrolle vers la ligne de la facture cible et applique un flash gold pendant
// 3 s. Déclenché par /admin/billing?invoiceId=<id> (lien depuis la fiche
// réservation). Aucune action si l'id n'est pas dans le DOM (facture hors
// du mois courant — l'utilisateur doit changer de mois).
export default function InvoiceHighlight({ invoiceId }: { invoiceId: string }) {
  useEffect(() => {
    if (!invoiceId) return;
    const el = document.getElementById(`invoice-row-${invoiceId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('invoice-row-flash');
    const timer = window.setTimeout(() => {
      el.classList.remove('invoice-row-flash');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [invoiceId]);

  return null;
}
