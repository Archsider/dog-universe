// Lifetime Boarding Agreement — PDF generator
//
// Source : verbatim contract text supplied by Mehdi, 2026-05-19 (Stephanie
// Yanik / Mama use case).  Effective Date is May 18, 2026 ; supersedes the
// prior Care Agreement of May 17, 2025.
//
// English-only document.  The on-screen rendering at
// `/[locale]/contracts/lifetime/[token]` MUST stay synchronized with the
// `LIFETIME_ARTICLES` constant below — Stephanie reads on screen what she
// signs in the PDF.  Updating the text means updating both files together.
//
// Workflow :
//   - When `signatureDataUrl` is set → owner signature embedded in the
//     signature block + signed-at + IP metadata.
//   - When null → empty signature line for paper-signing fallback.

import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { logger } from '@/lib/logger';
import { LIFETIME_ARTICLES, type ContentBlock } from '@/lib/contract-pdf-lifetime-content';

let LOGO_DATA_URL: string | null = null;
let STAMP_DATA_URL: string | null = null;
try {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'logo_rgba.png'));
  LOGO_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (err) {
  logger.error('contract-pdf-lifetime', 'logo_rgba.png not found', { error: err instanceof Error ? err.message : String(err) });
}
try {
  const buf = fs.readFileSync(path.join(process.cwd(), 'private', 'stamp.png'));
  STAMP_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (err) {
  logger.error('contract-pdf-lifetime', 'stamp.png not found', { error: err instanceof Error ? err.message : String(err) });
}

const COLORS = {
  gold: '#C9A84C',
  goldDeep: '#8B6914',
  charcoal: '#1A1A1A',
  textBody: '#2D2D2D',
  textMuted: '#6B7280',
  border: '#F0D98A',
  bgIvory: '#FFF9E8',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Times-Roman',
    fontSize: 10.5,
    color: COLORS.textBody,
    padding: '50px 50px 60px 50px',
    lineHeight: 1.45,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
  },
  brand: {
    fontSize: 17,
    fontFamily: 'Times-Bold',
    color: COLORS.gold,
    letterSpacing: 2,
  },
  brandTag: {
    fontSize: 7.5,
    color: COLORS.textMuted,
    marginTop: 2,
    fontFamily: 'Times-Italic',
  },
  legalLine: {
    fontSize: 7.5,
    color: COLORS.textMuted,
    textAlign: 'right',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Times-Bold',
    color: COLORS.charcoal,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Times-Italic',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 18,
  },
  preamble: {
    fontSize: 10.5,
    color: COLORS.textBody,
    marginBottom: 14,
    textAlign: 'justify',
  },
  partiesHeader: {
    fontSize: 10,
    fontFamily: 'Times-Bold',
    color: COLORS.charcoal,
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 1,
  },
  partyBlock: {
    backgroundColor: COLORS.bgIvory,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    padding: 10,
    marginBottom: 10,
  },
  partyName: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    color: COLORS.charcoal,
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 9.5,
    color: COLORS.textBody,
    marginBottom: 1,
  },
  partyLineItalic: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    fontFamily: 'Times-Italic',
    marginBottom: 1,
  },
  collective: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    fontFamily: 'Times-Italic',
    textAlign: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    color: COLORS.charcoal,
    marginTop: 12,
    marginBottom: 4,
  },
  body: {
    fontSize: 10.5,
    color: COLORS.textBody,
    lineHeight: 1.5,
    marginBottom: 4,
    textAlign: 'justify',
  },
  bulletRow: {
    flexDirection: 'row',
    marginLeft: 12,
    marginBottom: 2,
  },
  bulletDot: {
    fontSize: 10.5,
    color: COLORS.gold,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: 10.5,
    color: COLORS.textBody,
    lineHeight: 1.5,
  },
  signatureBlock: {
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  signaturesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  signatureCol: {
    width: '47%',
  },
  signatureHeading: {
    fontSize: 9,
    fontFamily: 'Times-Bold',
    color: COLORS.charcoal,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signatureMeta: {
    fontSize: 9,
    color: COLORS.textBody,
    marginBottom: 1,
  },
  signatureMetaMuted: {
    fontSize: 8,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  signatureImg: {
    width: 160,
    height: 60,
    objectFit: 'contain',
    marginTop: 6,
  },
  stampImg: {
    width: 90,
    height: 90,
    objectFit: 'contain',
    marginTop: 6,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    height: 40,
    marginTop: 6,
    marginBottom: 4,
  },
  signatureHint: {
    fontSize: 7.5,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 50,
    right: 50,
    fontSize: 7.5,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 22,
    right: 50,
    fontSize: 7.5,
    color: COLORS.textMuted,
  },
});

// Contract sections (verbatim — supplied by Mehdi 2026-05-19) live in
// `contract-pdf-lifetime-content.ts` so the on-screen rendering on the
// public signing page can import the same data without pulling in
// @react-pdf/renderer.  Re-exported here for backwards-compat with any
// caller that imports `LIFETIME_ARTICLES` from this module.
export { LIFETIME_ARTICLES } from '@/lib/contract-pdf-lifetime-content';


export interface LifetimeContractPDFData {
  // The contract terms are verbatim and identity is hardcoded in the
  // document (Stephanie Yanik / Mama).  The data here is only used for
  // metadata (signature block + audit trail).  Keeping the typed shape
  // means we can extend later if we go multi-pet without breaking callers.
  signatureDataUrl?: string | null;
  signedAt?: Date | null;
  ipAddress?: string | null;
  version?: string;
}

function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'para' ? (
          <Text key={i} style={styles.body}>{b.text}</Text>
        ) : (
          <View key={i}>
            {b.items.map((item, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </>
  );
}

function ContractDocument({ data }: { data: LifetimeContractPDFData }) {
  const signedAtStr = data.signedAt
    ? data.signedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Letterhead */}
        <View style={styles.header} fixed>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {LOGO_DATA_URL && (
              <Image src={LOGO_DATA_URL} style={{ width: 46, height: 46, objectFit: 'contain' }} />
            )}
            <View>
              <Text style={styles.brand}>DOG UNIVERSE</Text>
              <Text style={styles.brandTag}>Premium pet boarding · Marrakech, Morocco</Text>
            </View>
          </View>
          <View>
            <Text style={styles.legalLine}>RC 87023 — IF 25081867 — ICE 002035800000002</Text>
            <Text style={styles.legalLine}>+212 669-183981 · contact@doguniverse.ma</Text>
          </View>
        </View>

        {/* Title block */}
        <Text style={styles.title}>LIFETIME BOARDING AGREEMENT</Text>
        <Text style={styles.subtitle}>Agreement for the Permanent Care of Mama</Text>

        {/* Preamble */}
        <Text style={styles.preamble}>
          This Lifetime Boarding Agreement (the &quot;Agreement&quot;) is entered into on <Text style={{ fontFamily: 'Times-Bold' }}>May 18, 2026</Text> (the &quot;Effective Date&quot;), and supersedes and replaces the prior Care Agreement dated May 17, 2025.
        </Text>

        {/* Parties */}
        <Text style={styles.partiesHeader}>BETWEEN:</Text>
        <View style={styles.partyBlock}>
          <Text style={styles.partyName}>Dog Universe SARLAU (the &quot;Care Provider&quot;)</Text>
          <Text style={styles.partyLineItalic}>A licensed pet boarding and care facility located in Marrakech, Morocco</Text>
          <Text style={styles.partyLine}>Contact: +212 669-183981 — contact@doguniverse.ma</Text>
          <Text style={styles.partyLine}>Represented by: Mehdi Khtabe, Founder &amp; Director</Text>
        </View>

        <Text style={styles.partiesHeader}>AND:</Text>
        <View style={styles.partyBlock}>
          <Text style={styles.partyName}>Stephanie Yanik (the &quot;Owner&quot;)</Text>
          <Text style={styles.partyLine}>Contact: +1 (248) 321-7653 — stephyanik@gmail.com</Text>
        </View>

        <Text style={styles.collective}>(individually a &quot;Party&quot;, together the &quot;Parties&quot;)</Text>

        {/* Articles */}
        {LIFETIME_ARTICLES.map((section, idx) => (
          <View key={idx} wrap={section.blocks.length > 4}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <ContentBlocks blocks={section.blocks} />
          </View>
        ))}

        {/* Signatures */}
        <View style={styles.signatureBlock} wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={styles.signaturesGrid}>
            {/* Care Provider */}
            <View style={styles.signatureCol}>
              <Text style={styles.signatureHeading}>For the Care Provider — Dog Universe SARLAU</Text>
              <Text style={styles.signatureMeta}>Name: Mehdi Khtabe</Text>
              <Text style={styles.signatureMeta}>Title: Founder &amp; Director</Text>
              <Text style={styles.signatureMeta}>Date: May 18, 2026</Text>
              <Text style={[styles.signatureMeta, { marginTop: 6, fontFamily: 'Times-Italic' }]}>Signature &amp; Stamp:</Text>
              {STAMP_DATA_URL && (
                <Image src={STAMP_DATA_URL} style={styles.stampImg} />
              )}
            </View>

            {/* Owner */}
            <View style={styles.signatureCol}>
              <Text style={styles.signatureHeading}>The Owner — Stephanie Yanik</Text>
              <Text style={styles.signatureMeta}>Name: Stephanie Yanik</Text>
              <Text style={styles.signatureMeta}>
                Date: {signedAtStr ?? '_____________'}
              </Text>
              <Text style={[styles.signatureMeta, { marginTop: 6, fontFamily: 'Times-Italic' }]}>Signature:</Text>
              {data.signatureDataUrl ? (
                <>
                  <Image src={data.signatureDataUrl} style={styles.signatureImg} />
                  {data.ipAddress && (
                    <Text style={styles.signatureMetaMuted}>Signed digitally · IP {data.ipAddress}</Text>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureHint}>Hand-signed signature</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Dog Universe SARLAU — RC 87023 · IF 25081867 · ICE 002035800000002 · +212 669-183981 · contact@doguniverse.ma · Marrakech, Morocco
        </Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function generateLifetimeContractPDF(
  data: LifetimeContractPDFData = {},
): Promise<Buffer> {
  return renderToBuffer(<ContractDocument data={data} />);
}
