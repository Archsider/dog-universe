'use client';

import {
  Pencil, Trash2, Download, Eye, Loader2, Save, MessageSquare,
} from 'lucide-react';
import { formatDate, getInvoiceStatusColor } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type InvoiceData } from './lib';

interface Props {
  invoice: InvoiceData;
  locale: string;
  isFr: boolean;
  mode: 'view' | 'edit';
  saving: boolean;
  sendingSms: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onSendSms: () => void;
  onDelete: () => void;
}

export function InvoiceHeader({
  invoice, locale, isFr, mode, saving, sendingSms,
  onEdit, onCancelEdit, onSave, onSendSms, onDelete,
}: Props) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xl font-bold text-charcoal">{invoice.invoiceNumber}</span>
          <Badge className={`text-xs ${getInvoiceStatusColor(invoice.status)}`}>
            {STATUS_LABELS[invoice.status]?.[isFr ? 'fr' : 'en'] ?? invoice.status}
          </Badge>
        </div>
        <p className="text-sm text-gray-500 mt-1">{formatDate(invoice.issuedAt, locale)}</p>
      </div>

      {mode === 'view' ? (
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/invoices/${invoice.id}/pdf?view=1&v=${invoice.version}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            {isFr ? 'Aperçu PDF' : 'PDF preview'}
          </a>
          <a
            href={`/api/invoices/${invoice.id}/pdf?v=${invoice.version}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {isFr ? 'Télécharger' : 'Download'}
          </a>
          <button
            onClick={onSendSms}
            disabled={sendingSms || !invoice.client.phone || invoice.status === 'CANCELLED'}
            title={
              !invoice.client.phone
                ? (isFr ? 'Client sans téléphone' : 'No phone on file')
                : invoice.status === 'CANCELLED'
                  ? (isFr ? 'Facture annulée' : 'Invoice cancelled')
                  : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendingSms
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <MessageSquare className="h-3.5 w-3.5" />}
            {isFr ? 'Envoyer par SMS' : 'Send by SMS'}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {isFr ? 'Modifier' : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isFr ? 'Supprimer' : 'Delete'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={onCancelEdit}
            disabled={saving}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isFr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isFr ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
