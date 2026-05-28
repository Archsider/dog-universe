'use client';

import { type InvoiceData } from './invoice-detail/lib';
import { useInvoiceDetail } from './invoice-detail/use-invoice-detail';
import { InvoiceHeader } from './invoice-detail/InvoiceHeader';
import { InvoiceItemsView, InvoiceItemsEdit } from './invoice-detail/InvoiceItemsTable';
import { PaymentHistorySection, AddPaymentSection } from './invoice-detail/PaymentsSection';
import { DeleteInvoiceModal } from './invoice-detail/InvoiceActions';
import {
  ClientSummaryCards,
  StayEncart,
  NotesView,
  BookingLink,
} from './invoice-detail/InvoiceViewSections';
import {
  ClientEditForm,
  MetadataEditForm,
  NotesEditForm,
} from './invoice-detail/InvoiceEditSections';

export type { InvoiceData } from './invoice-detail/lib';

export default function InvoiceDetailClient({
  invoice: initialInvoice,
  locale,
}: {
  invoice: InvoiceData;
  locale: string;
}) {
  const s = useInvoiceDetail(initialInvoice, locale);

  return (
    <>
      <InvoiceHeader
        invoice={s.invoice}
        locale={locale}
        isFr={s.isFr}
        mode={s.mode}
        saving={s.saving}
        sendingSms={s.sendingSms}
        duplicating={s.duplicating}
        onEdit={s.enterEdit}
        onCancelEdit={() => s.setMode('view')}
        onSave={s.handleSave}
        onSendSms={s.handleSendSms}
        onDelete={() => s.setDeleteOpen(true)}
        onDuplicate={s.handleDuplicate}
      />

      {s.mode === 'view' && (
        <div className="space-y-4">
          <ClientSummaryCards invoice={s.invoice} locale={locale} isFr={s.isFr} remaining={s.remaining} />
          <StayEncart invoice={s.invoice} isFr={s.isFr} />
          <InvoiceItemsView invoice={s.invoice} isFr={s.isFr} />
          <PaymentHistorySection
            invoice={s.invoice}
            locale={locale}
            isFr={s.isFr}
            deletingPaymentId={s.deletingPaymentId}
            onDeletePayment={s.handleDeletePayment}
          />
          <NotesView invoice={s.invoice} isFr={s.isFr} />
          <BookingLink invoice={s.invoice} locale={locale} isFr={s.isFr} />
        </div>
      )}

      {s.mode === 'edit' && (
        <div className="space-y-4">
          <ClientEditForm
            isFr={s.isFr}
            editClientName={s.editClientName}
            editClientPhone={s.editClientPhone}
            editClientEmail={s.editClientEmail}
            onChangeName={s.setEditClientName}
            onChangePhone={s.setEditClientPhone}
            onChangeEmail={s.setEditClientEmail}
          />
          <InvoiceItemsEdit
            editItems={s.editItems}
            editTotal={s.editTotal}
            isFr={s.isFr}
            onAdd={s.addItem}
            onRemove={s.removeItem}
            onUpdate={s.updateItem}
            onPatch={s.patchItem}
          />
          <MetadataEditForm
            isFr={s.isFr}
            editIssuedAt={s.editIssuedAt}
            editStatus={s.editStatus}
            onChangeIssuedAt={s.setEditIssuedAt}
            onChangeStatus={s.setEditStatus}
          />
          <NotesEditForm
            isFr={s.isFr}
            editNotes={s.editNotes}
            onChangeNotes={s.setEditNotes}
          />
          <AddPaymentSection
            invoice={s.invoice}
            locale={locale}
            isFr={s.isFr}
            newPaymentDate={s.newPaymentDate}
            newPaymentAmount={s.newPaymentAmount}
            newPaymentMethod={s.newPaymentMethod}
            newPaymentSendSms={s.newPaymentSendSms}
            addingPayment={s.addingPayment}
            deletingPaymentId={s.deletingPaymentId}
            onChangeDate={s.setNewPaymentDate}
            onChangeAmount={s.setNewPaymentAmount}
            onChangeMethod={s.setNewPaymentMethod}
            onChangeSendSms={s.setNewPaymentSendSms}
            onAddPayment={s.handleAddPayment}
            onDeletePayment={s.handleDeletePayment}
          />
        </div>
      )}

      {s.deleteOpen && (
        <DeleteInvoiceModal
          invoiceNumber={s.invoice.invoiceNumber}
          isFr={s.isFr}
          deleting={s.deleting}
          onCancel={() => s.setDeleteOpen(false)}
          onConfirm={s.handleDelete}
        />
      )}
    </>
  );
}
