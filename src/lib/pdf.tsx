import React from 'react';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { formatDateShort, formatMAD } from '@/lib/utils';

const LOGO_PATH = path.resolve(process.cwd(), 'public', 'logo.png');

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
  colDescription: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
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

interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  status: string;
  issuedAt: Date;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  notes?: string | null;
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
  }[];
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

function InvoicePDFDocument({ invoice }: { invoice: InvoiceData }) {
  const isPaid = invoice.status === 'PAID';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image src={LOGO_PATH} style={{ width: 60, height: 60, objectFit: 'contain' }} />
            <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#C9A84C' }}>DOG UNIVERSE</Text>
          </View>
        </View>

        {/* Invoice Title & Meta */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 }}>
          <View>
            <Text style={styles.invoiceTitle}>FACTURE</Text>
            <Text style={styles.invoiceMeta}>N° {invoice.invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>
              Émise le : {formatDateShort(invoice.issuedAt, 'fr')}
            </Text>
            {invoice.paidAt && (
              <Text style={styles.invoiceMeta}>
                Payée le : {formatDateShort(invoice.paidAt, 'fr')}
              </Text>
            )}
            {invoice.paymentMethod && (
              <Text style={styles.invoiceMeta}>
                Mode de paiement : {PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[
              styles.statusBadge,
              { backgroundColor: isPaid ? '#DCFCE7' : '#FEF9C3', color: isPaid ? '#166534' : '#854D0E' }
            ]}>
              <Text style={{ color: isPaid ? '#166534' : '#854D0E', fontFamily: 'Helvetica-Bold', fontSize: 10 }}>
                {isPaid ? '✓ PAYÉE' : '⏳ EN ATTENTE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.clientInfo}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.client.name}</Text>
            <Text style={{ color: '#6B7280' }}>{invoice.client.email}</Text>
            {invoice.client.phone && <Text style={{ color: '#6B7280' }}>{invoice.client.phone}</Text>}
          </View>
        </View>

        {/* Booking reference if applicable */}
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

        {/* Items table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>Qté</Text>
              <Text style={[styles.tableHeaderText, styles.colUnit]}>P.U.</Text>
              <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
            </View>

            {/* Rows */}
            {invoice.items.map((item, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[{ fontSize: 10 }, styles.colDescription]}>{item.description}</Text>
                <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colQty]}>{item.quantity}</Text>
                <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colUnit]}>{formatMAD(item.unitPrice)}</Text>
                <Text style={[{ fontSize: 10, textAlign: 'right' }, styles.colTotal]}>{formatMAD(item.total)}</Text>
              </View>
            ))}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalAmount}>{formatMAD(invoice.amount)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={{ ...styles.notesText, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Notes :</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          DOG UNIVERSE SARLAU — Marrakech — RC : 87023 — ICE : 002035800000002
          {'\n'}+212 669 183 981 — Merci pour votre confiance.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateInvoicePDF(invoice: InvoiceData): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDFDocument invoice={invoice} />);
  return buffer;
}
