// Lifetime boarding contract — PDF generator for paper-signed lifetime
// boarding agreements (Stephanie/Mama use case, 2026-05-18).
//
// Distinct from the standard `contract-pdf.tsx` generator because :
//   - Terms are specific to lifetime boarding (no time limit, monthly
//     budget management by Dog Universe).
//   - No client digital signature — the PDF is printed, hand-signed, and
//     filed by admin.  Signature box is therefore empty (just a line for
//     the client to sign by hand).
//   - The client + dog identity are pre-filled from admin-provided data,
//     so Stephanie reads / signs / returns without typing anything.
//
// Re-uses the same header / stamp / footer styles as the standard contract
// for visual consistency.

import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { logger } from '@/lib/logger';

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

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#2C2C2C',
    padding: 42,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#C9A84C',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: '#C9A84C',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 18,
  },
  partiesBox: {
    backgroundColor: '#FFF9E8',
    borderWidth: 1,
    borderColor: '#F0D98A',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  partyRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  partyLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    width: 90,
  },
  partyValue: {
    fontSize: 9.5,
    color: '#1A1A1A',
    flex: 1,
  },
  articleTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1A1A1A',
    marginTop: 10,
    marginBottom: 3,
  },
  articleText: {
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.55,
    marginBottom: 2,
  },
  signatureSection: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: '#F0D98A',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  signatureBox: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    height: 50,
    marginBottom: 4,
  },
  signatureHint: {
    fontSize: 7,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  stampImg: {
    width: 95,
    height: 95,
    objectFit: 'contain',
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 7.5,
    color: '#9CA3AF',
    borderTopWidth: 1,
    borderTopColor: '#F0D98A',
    paddingTop: 8,
  },
});

export interface LifetimeContractPDFData {
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  dogName: string;
  dogDescription: string; // "blanche avec taches marron, stérilisée, identifiée"
  dogGender: string;      // "Femelle" / "Mâle"
  contractDate: Date;
  version?: string;
}

const LIFETIME_ARTICLES = [
  {
    title: 'PRÉAMBULE',
    content: `Le présent contrat définit les conditions particulières régissant l'accueil à vie de l'animal désigné ci-dessus au sein de l'établissement DOG UNIVERSE, pension animale située à Marrakech.\nIl complète et déroge, en tant que de besoin, aux conditions générales de pension habituellement applicables, lesquelles continuent de s'appliquer pour tout point non expressément modifié par le présent contrat.`,
  },
  {
    title: 'Article 1 — Engagement de pension à vie',
    content: `DOG UNIVERSE s'engage à accueillir l'animal en pension permanente pour le restant de sa vie naturelle, dans des conditions professionnelles garantissant sécurité, hygiène, bien-être et qualité de soins équivalents à ceux des autres pensionnaires.\nLe propriétaire confirme transférer la garde matérielle quotidienne de l'animal à la pension tout en demeurant juridiquement propriétaire de l'animal.`,
  },
  {
    title: 'Article 2 — Statut de résident permanent',
    content: `L'animal est identifié dans le système de DOG UNIVERSE comme « résident permanent ». À ce titre, il n'est pas comptabilisé comme un séjour temporaire et bénéficie d'un suivi adapté à une présence longue durée (espace dédié, routine stable, suivi vétérinaire continu).`,
  },
  {
    title: 'Article 3 — Frais de pension et soins',
    content: `Le propriétaire s'engage à régler l'intégralité des frais liés à la prise en charge de l'animal : pension mensuelle, alimentation, soins vétérinaires courants et exceptionnels, traitements anti-parasitaires, toilettage, vaccinations et tout autre frais nécessaire au bien-être de l'animal.\nDOG UNIVERSE administre l'ensemble de ces dépenses pour le compte du propriétaire à partir d'un budget mensuel provisionné par celui-ci. Un relevé détaillé est communiqué au propriétaire à fréquence convenue.`,
  },
  {
    title: 'Article 4 — Provisions et facturation',
    content: `Le propriétaire alimente régulièrement un budget destiné à couvrir les frais courants. DOG UNIVERSE tient une comptabilité distincte pour l'animal et informe le propriétaire lorsque le solde nécessite d'être réapprovisionné.\nEn cas de soins urgents ou imprévus dépassant le solde disponible, DOG UNIVERSE engage les frais dans l'intérêt de l'animal et en informe le propriétaire sans délai. Le remboursement est dû dans les meilleurs délais.`,
  },
  {
    title: 'Article 5 — Mandat sanitaire',
    content: `Le propriétaire donne mandat exprès à DOG UNIVERSE pour autoriser tout acte vétérinaire jugé nécessaire en cas d'urgence (consultation, traitement, hospitalisation, intervention chirurgicale) lorsque celui-ci ne peut être joint dans un délai raisonnable. DOG UNIVERSE fait toujours appel à un vétérinaire agréé et conserve les justificatifs.`,
  },
  {
    title: 'Article 6 — Visites du propriétaire',
    content: `Le propriétaire peut rendre visite à l'animal sur rendez-vous, dans le respect des horaires d'ouverture et de la tranquillité de la pension. Toute visite est tracée dans le registre interne.`,
  },
  {
    title: 'Article 7 — Fin de prise en charge',
    content: `Le présent contrat peut prendre fin :\n• Par le décès naturel de l'animal — auquel cas DOG UNIVERSE informe immédiatement le propriétaire et organise les démarches conformément à ses souhaits.\n• Par la reprise de l'animal par son propriétaire moyennant un préavis raisonnable.\n• Par la décision motivée de DOG UNIVERSE en cas de manquements répétés du propriétaire (notamment défaut de provisionnement du budget après mise en demeure).`,
  },
  {
    title: 'Article 8 — Responsabilité',
    content: `DOG UNIVERSE met en œuvre tous les moyens raisonnables pour assurer la sécurité et le bien-être de l'animal. La responsabilité de la pension ne peut être engagée en cas d'événement imprévisible et irrésistible (force majeure), de maladie préexistante non déclarée ou d'accident survenu malgré les précautions prises.`,
  },
  {
    title: 'Article 9 — Données personnelles',
    content: `Les informations personnelles du propriétaire et les données de santé de l'animal sont traitées par DOG UNIVERSE dans le strict cadre de l'exécution du présent contrat. Le propriétaire dispose d'un droit d'accès, de rectification et de suppression de ses données conformément à la loi marocaine n° 09-08.`,
  },
  {
    title: 'Article 10 — Litiges',
    content: `Les parties s'efforceront de régler à l'amiable tout différend lié à l'exécution du présent contrat. À défaut, les tribunaux compétents seront ceux de Marrakech, le droit marocain étant exclusivement applicable.`,
  },
];

function LifetimeContractDocument({ data }: { data: LifetimeContractPDFData }) {
  const dateStr = data.contractDate.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header — same style as the standard contract */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {LOGO_DATA_URL && (
              <Image src={LOGO_DATA_URL} style={{ width: 44, height: 44, objectFit: 'contain' }} />
            )}
            <View>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#C9A84C' }}>DOG UNIVERSE</Text>
              <Text style={{ fontSize: 7.5, color: '#9CA3AF', marginTop: 2 }}>Pension & Services pour animaux — Marrakech</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#6B7280' }}>RC : 87023 — IF : 25081867 — ICE : 002035800000002</Text>
            <Text style={{ fontSize: 8, color: '#6B7280', marginTop: 2 }}>Tél : 00212669183981</Text>
            <Text style={{ fontSize: 8, color: '#6B7280', marginTop: 2 }}>contact@doguniverse.ma</Text>
          </View>
        </View>

        <Text style={styles.title}>CONTRAT DE PENSION À VIE</Text>
        <Text style={styles.subtitle}>DOG UNIVERSE SARLAU — Dr el Caid Souihla Saada, Marrakech, Maroc</Text>

        {/* Parties box — pre-filled identity */}
        <View style={styles.partiesBox}>
          <View style={styles.partyRow}>
            <Text style={styles.partyLabel}>Date :</Text>
            <Text style={styles.partyValue}>{dateStr}</Text>
          </View>
          <View style={styles.partyRow}>
            <Text style={styles.partyLabel}>Propriétaire :</Text>
            <Text style={styles.partyValue}>{data.clientName}</Text>
          </View>
          {data.clientPhone && (
            <View style={styles.partyRow}>
              <Text style={styles.partyLabel}>Téléphone :</Text>
              <Text style={styles.partyValue}>{data.clientPhone}</Text>
            </View>
          )}
          <View style={styles.partyRow}>
            <Text style={styles.partyLabel}>Animal :</Text>
            <Text style={styles.partyValue}>{data.dogName} ({data.dogGender})</Text>
          </View>
          <View style={styles.partyRow}>
            <Text style={styles.partyLabel}>Description :</Text>
            <Text style={styles.partyValue}>{data.dogDescription}</Text>
          </View>
        </View>

        {/* Contract articles */}
        {LIFETIME_ARTICLES.map((article, idx) => (
          <View key={idx} wrap={false}>
            <Text style={styles.articleTitle}>{article.title}</Text>
            <Text style={styles.articleText}>{article.content}</Text>
          </View>
        ))}

        {/* Signature section — paper-signed, empty box */}
        <View style={styles.signatureSection}>
          {/* Client signature — hand signing */}
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Signature du propriétaire</Text>
            <Text style={{ fontSize: 8, color: '#374151', marginBottom: 4 }}>{data.clientName}</Text>
            <Text style={{ fontSize: 8, color: '#374151', marginBottom: 8, fontStyle: 'italic' }}>
              Lu et accepté — précédé de la mention manuscrite « Lu et approuvé »
            </Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureHint}>Signature manuscrite + date</Text>
          </View>

          {/* Stamp */}
          <View style={{ ...styles.signatureBox, alignItems: 'flex-end' }}>
            <Text style={styles.signatureLabel}>{`Cachet de l'établissement`}</Text>
            {STAMP_DATA_URL && (
              <Image src={STAMP_DATA_URL} style={styles.stampImg} />
            )}
            <Text style={{ fontSize: 8, color: '#374151', marginTop: 4 }}>DOG UNIVERSE SARLAU</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {`Contrat de pension à vie — version ${data.version ?? '1.0'} — généré le ${dateStr}\nDOG UNIVERSE SARLAU — RC : 87023 — IF : 25081867 — ICE : 002035800000002 — Tél : 00212669183981 — contact@doguniverse.ma — Marrakech, Maroc`}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateLifetimeContractPDF(
  data: LifetimeContractPDFData,
): Promise<Buffer> {
  return renderToBuffer(<LifetimeContractDocument data={data} />);
}
