'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ClientSearchSelect from '../ClientSearchSelect';
import { LineItemsEditor } from './LineItemsEditor';
import { MarkPaidSection } from './MarkPaidSection';
import { SERVICE_TYPES, type LineItem, type CatalogProduct, type QuickAddPreset } from './types';

interface Client {
  id: string;
  name: string;
  email: string;
}

interface InvoiceFormBodyProps {
  locale: string;
  // Client selection
  clientId: string;
  onClientIdChange: (v: string) => void;
  walkInName: string;
  onWalkInNameChange: (v: string) => void;
  walkInPhone: string;
  onWalkInPhoneChange: (v: string) => void;
  preselectedClientId?: string;
  preselectedClientName?: string;
  clients?: Client[];
  // Service type + date
  serviceType: string;
  onServiceTypeChange: (v: string) => void;
  issuedAt: string;
  onIssuedAtChange: (v: string) => void;
  // Line items
  items: LineItem[];
  catalog: CatalogProduct[];
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  onUpdateItem: (i: number, field: keyof LineItem, value: string | number | undefined) => void;
  onPatchItem?: (i: number, patch: Partial<LineItem>) => void;
  onAddPreset: (preset: QuickAddPreset) => void;
  // Notes
  notes: string;
  onNotesChange: (v: string) => void;
  // Mark paid
  markPaid: boolean;
  paymentMethod: string;
  paidAt: string;
  onMarkPaidChange: (v: boolean) => void;
  onPaymentMethodChange: (v: string) => void;
  onPaidAtChange: (v: string) => void;
  // Error
  error: string;
}

export function InvoiceFormBody({
  locale, clientId, onClientIdChange, walkInName, onWalkInNameChange, walkInPhone, onWalkInPhoneChange,
  preselectedClientId, preselectedClientName, clients, serviceType, onServiceTypeChange,
  issuedAt, onIssuedAtChange, items, catalog, onAddItem, onRemoveItem, onUpdateItem, onPatchItem, onAddPreset,
  notes, onNotesChange, markPaid, paymentMethod, paidAt,
  onMarkPaidChange, onPaymentMethodChange, onPaidAtChange, error,
}: InvoiceFormBodyProps) {
  const fr = locale === 'fr';

  return (
    <div className="space-y-5 py-2">
      {/* Client + Category */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">{fr ? 'Client *' : 'Client *'}</Label>
          {preselectedClientId ? (
            <div className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 bg-ivory-50 text-charcoal font-medium">
              {preselectedClientName ?? clients?.find(c => c.id === preselectedClientId)?.name ?? preselectedClientId}
            </div>
          ) : (
            <>
              <ClientSearchSelect
                value={clientId}
                onChange={onClientIdChange}
                locale={locale}
                includeWalkIn
                placeholder={fr ? 'Rechercher un client…' : 'Search a client…'}
              />
              {clientId === 'WALK_IN' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{fr ? 'Nom *' : 'Name *'}</Label>
                    <Input value={walkInName} onChange={e => onWalkInNameChange(e.target.value)} placeholder={fr ? 'Nom du passager' : 'Walk-in name'} className="mt-1 text-sm h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">{fr ? 'Téléphone' : 'Phone'}</Label>
                    <Input value={walkInPhone} onChange={e => onWalkInPhoneChange(e.target.value)} placeholder="+212..." className="mt-1 text-sm h-8" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <Label className="text-xs">{fr ? 'Catégorie (optionnel)' : 'Category (optional)'}</Label>
          <select value={serviceType} onChange={e => onServiceTypeChange(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white">
            {SERVICE_TYPES.map(st => (
              <option key={st.value} value={st.value}>{fr ? st.fr : st.en}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">{fr ? 'Laissez "Multiple" pour combiner plusieurs services' : 'Leave "Multiple" to combine several services'}</p>
        </div>
      </div>

      {/* Date */}
      <div className="w-48">
        <Label className="text-xs">{fr ? 'Date de facturation' : 'Invoice date'}</Label>
        <Input type="date" value={issuedAt} onChange={e => onIssuedAtChange(e.target.value)} className="mt-1 text-sm" />
      </div>

      {/* Line items editor */}
      <LineItemsEditor items={items} catalog={catalog} locale={locale} onAddItem={onAddItem} onRemoveItem={onRemoveItem} onUpdateItem={onUpdateItem} onPatchItem={onPatchItem} onAddPreset={onAddPreset} />

      {/* Notes */}
      <div>
        <Label className="text-xs">{fr ? 'Notes (optionnel)' : 'Notes (optional)'}</Label>
        <Textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={2} className="mt-1 text-sm" placeholder={fr ? 'Informations complémentaires…' : 'Additional information…'} />
      </div>

      {/* Mark as paid */}
      <MarkPaidSection markPaid={markPaid} paymentMethod={paymentMethod} paidAt={paidAt} locale={locale} onMarkPaidChange={onMarkPaidChange} onPaymentMethodChange={onPaymentMethodChange} onPaidAtChange={onPaidAtChange} />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}
    </div>
  );
}
