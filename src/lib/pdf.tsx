import React from 'react';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { formatDateShort, formatMAD } from '@/lib/utils';

const LOGO_PATH = path.resolve(process.cwd(), 'public', 'logo_rgba.png');

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#2C2C2C',
    padding: 40,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#C9A84C',
  },
  logo: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#C9A84C',
  },
  companySubtitle: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 2,
  },
  companyDetails: {
    textAlign: 'right',
    fontSize: 9,
    color: '#6B7280',
    lineHeight: 1.6,
  },
  invoiceTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  invoiceMeta: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#C9A84C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0D98A',
  },
  clientInfo: {
    fontSize: 10,
    lineHeight: 1.7,
  },
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FAF6F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EDD8',
  },
  tableHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  // Table columns — Description | Qté | P.U. | Total | Statut
  colDescription: { flex: 3 },
  colQty:         { flex: 0.8, textAlign: 'right' },
  colUnit:        { flex: 1.5, textAlign: 'right' },
  colTotal:       { flex: 1.5, textAlign: 'right' },
  colStatus:      { flex: 1.3, textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: '#2C2C2C',
    marginRight: 16,
  },
  totalAmount: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: '#C9A84C',
  },
  statusBadge: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
    borderTopWidth: 1,
    borderTopColor: '#F0D98A',
    paddingTop: 12,
  },
  notesSection: {
    backgroundColor: '#FAF6F0',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
  },
  notesText: {
    fontSize: 9,
    color: '#6B7280',
    lineHeight: 1.5,
  },
});

interface PaymentRow {
  amount: number;
  paymentMethod: string;
  paymentDate: Date;
  notes?: string | null;
}

interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  paidAmount?: number | null;
  status: string;
  issuedAt: Date;
  paidAt?: Date | null;
  notes?: string | null;
  clientDisplayName?: string | null;
  clientDisplayPhone?: string | null;
  client: {
    name: string;
    email: string;
    phone?: string | null;
  };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    allocatedAmount?: number;
    status?: string;
  }[];
  payments?: PaymentRow[];
  booking?: {
    serviceType?: string;
    startDate?: Date;
    endDate?: Date;
    bookingPets?: { pet: { name: string } }[];
  } | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  CHECK: 'Chèque',
  TRANSFER: 'Virement bancaire',
};

function ItemStatusBadge({ status }: { status?: string }) {
  if (status === 'PAID') {
    return (
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#166534' }}>✓ Payé</Text>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400E' }}>Partiel</Text>
    );
  }
  return (
    <Text style={{ fontSize: 8, color: '#9CA3AF' }}>En attente</Text>
  );
}

function InvoicePDFDocument({ invoice }: { invoice: InvoiceData }) {
  const isPaid = invoice.status === 'PAID';
  const isPartial = invoice.status === 'PARTIALLY_PAID';
  const paidAmount = invoice.paidAmount ?? 0;
  const remaining = Math.max(0, invoice.amount - paidAmount);
  const payments = (invoice.payments ?? []).slice().sort(
    (a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  );
  const hasPayments = payments.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image src={LOGO_PATH} style={{ width: 52, height: 52, objectFit: 'contain' }} />
            <View>
              <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#C9A84C' }}>DOG UNIVERSE</Text>
              <Text style={{ fontSize: 8, color: '#9CA3AF', marginTop: 2 }}>Pension & Services pour animaux</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.7 }}>RC : 87023 — IF : 25081867 — ICE : 002035800000002</Text>
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.7 }}>Tél : 00212669183981</Text>
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.7 }}>contact@doguniverse.ma</Text>
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.7 }}>Marrakech, Maroc</Text>
          </View>
        </View>

        {/* ── Invoice title & meta ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 }}>
          <View>
            <Text style={styles.invoiceTitle}>FACTURE</Text>
            <Text style={styles.invoiceMeta}>N° {invoice.invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>
              Émise le : {formatDateShort(invoice.issuedAt, 'fr')}
            </Text>
            {/* "Payée le" and "Mode de paiement" removed — see section PAIEMENT below */}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[
              styles.statusBadge,
              { backgroundColor: isPaid ? '#DCFCE7' : isPartial ? '#FEF3C7' : '#FEF9C3' }
            ]}>
              <Text style={{
                color: isPaid ? '#166534' : isPartial ? '#92400E' : '#854D0E',
                fontFamily: 'Helvetica-Bold',
                fontSize: 10,
              }}>
                {isPaid ? 'PAYEE' : isPartial ? 'PARTIEL' : 'EN ATTENTE'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Client ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.clientInfo}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.clientDisplayName ?? invoice.client.name}</Text>
            <Text style={{ color: '#6B7280' }}>{invoice.client.email}</Text>
            {(invoice.clientDisplayPhone ?? invoice.client.phone) && (
              <Text style={{ color: '#6B7280' }}>{invoice.clientDisplayPhone ?? invoice.client.phone}</Text>
            )}
          </View>
        </View>

        {/* ── Booking reference ── */}
        {invoice.booking && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prestation</Text>
            <Text style={styles.clientInfo}>
              {invoice.booking.serviceType === 'BOARDING' ? 'Pension' : 'Taxi animalier'}
              {invoice.booking.bookingPets?.length
                ? ` — ${invoice.booking.bookingPets.map((bp) => bp.pet.name).join(', ')}`
                : ''}
            </Text>
            {invoice.booking.startDate && (
              <Text style={{ ...styles.clientInfo, color: '#6B7280' }}>
                Du {formatDateShort(invoice.booking.startDate, 'fr')}
                {invoice.booking.endDate ? ` au ${formatDateShort(invoice.booking.endDate, 'fr')}` : ''}
              </Text>
            )}
          </View>
        )}

        {/* ── Items table — with STATUT column ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>Qté</Text>
              <Text style={[styles.tableHeaderText, styles.colUnit]}>P.U.</Text>
              <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
              <Text style={[styles.tableHeaderText, styles.colStatus]}>Statut</Text>
            </View>

            {/* Rows — PARTIAL items are split into two visual lines (paid / pending) */}
            {invoice.items.flatMap((item, i) => {
              if (item.status === 'PARTIAL' && item.allocatedAmount != null && item.unitPrice > 0) {
                const paidQty = Math.floor(item.allocatedAmount / item.unitPrice);
                const paidAmt = paidQty * item.unitPrice;
                const pendingQty = item.quantity - paidQty;
                const pendingAmt = item.total - paidAmt;
                return [
                  <View key={`${i}-a`} style={styles.tableRow}>
                    <Text style={[{ fontSize: 10 }, styles.colDescription]}>{item.description}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colQty]}>{paidQty}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colUnit]}>{formatMAD(item.unitPrice)}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colTotal]}>{formatMAD(paidAmt)}</Text>
                    <View style={[styles.colStatus, { alignItems: 'center' }]}>
                      <ItemStatusBadge status="PAID" />
                    </View>
                  </View>,
                  <View key={`${i}-b`} style={styles.tableRow}>
                    <Text style={[{ fontSize: 10 }, styles.colDescription]}>{item.description}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colQty]}>{pendingQty}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colUnit]}>{formatMAD(item.unitPrice)}</Text>
                    <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colTotal]}>{formatMAD(pendingAmt)}</Text>
                    <View style={[styles.colStatus, { alignItems: 'center' }]}>
                      <ItemStatusBadge status="PENDING" />
                    </View>
                  </View>,
                ];
              }
              return [
                <View key={i} style={styles.tableRow}>
                  <Text style={[{ fontSize: 10 }, styles.colDescription]}>{item.description}</Text>
                  <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colQty]}>{item.quantity}</Text>
                  <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colUnit]}>{formatMAD(item.unitPrice)}</Text>
                  <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colTotal]}>{formatMAD(item.total)}</Text>
                  <View style={[styles.colStatus, { alignItems: 'center' }]}>
                    <ItemStatusBadge status={item.status} />
                  </View>
                </View>,
              ];
            })}

            {/* HT / TVA */}
            <View style={{ paddingTop: 6, paddingHorizontal: 8, gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 32 }}>
                <Text style={{ fontSize: 9, color: '#6B7280' }}>Montant HT</Text>
                <Text style={{ fontSize: 9, color: '#6B7280', minWidth: 60, textAlign: 'right' }}>{formatMAD(Math.round(invoice.amount / 1.2))}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 32 }}>
                <Text style={{ fontSize: 9, color: '#6B7280' }}>TVA 20%</Text>
                <Text style={{ fontSize: 9, color: '#6B7280', minWidth: 60, textAlign: 'right' }}>{formatMAD(invoice.amount - Math.round(invoice.amount / 1.2))}</Text>
              </View>
            </View>

            {/* Total TTC */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL TTC</Text>
              <Text style={styles.totalAmount}>{formatMAD(invoice.amount)}</Text>
            </View>
          </View>
        </View>

        {/* ── Section PAIEMENT — une ligne par Payment ── */}
        {hasPayments && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Paiement</Text>
            <View style={{ gap: 0 }}>
              {/* One row per Payment, chronological */}
              {payments.map((pmt, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 5,
                    paddingHorizontal: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F5EDD8',
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#6B7280' }}>
                    {PAYMENT_LABELS[pmt.paymentMethod] ?? pmt.paymentMethod}
                    {' — '}
                    {formatDateShort(new Date(pmt.paymentDate), 'fr')}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#166534', fontFamily: 'Helvetica-Bold' }}>
                    -{formatMAD(pmt.amount)}
                  </Text>
                </View>
              ))}

              {/* Separator */}
              <View style={{ borderBottomWidth: 1.5, borderBottomColor: '#C9A84C', marginVertical: 4 }} />

              {/* Total réglé */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#2C2C2C' }}>Total réglé</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#166534' }}>
                  -{formatMAD(paidAmount)}
                </Text>
              </View>

              {/* Reste à payer OR Payé intégralement */}
              {remaining > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>Reste à payer</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#C9A84C' }}>
                    {formatMAD(remaining)}
                  </Text>
                </View>
              ) : (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#166534' }}>
                    ✓ Payé intégralement
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Notes ── */}
        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={{ ...styles.notesText, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Notes :</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <Text style={styles.footer}>
          DOG UNIVERSE SARLAU — RC : 87023 — IF : 25081867 — ICE : 002035800000002
          {'\n'}Tél : 00212669183981 — contact@doguniverse.ma — Marrakech, Maroc — Merci pour votre confiance.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateInvoicePDF(invoice: InvoiceData): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDFDocument invoice={invoice} />);
  return buffer;
}
