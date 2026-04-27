import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

// Lire les assets au module-init :
//   1. Path littéral → Vercel Node File Tracer les bundle dans la lambda
//      (le path.resolve dynamique précédent était invisible pour NFT, d'où
//      le bug PDF_GENERATION_FAILED en prod sur tous navigateurs)
//   2. Évite un fs.readFileSync par requête PDF
//   3. <Image src={Buffer}> est supporté nativement par @react-pdf/renderer v3
//
// Le fallback sur erreur évite de planter le module entier — si un asset
// manque, le PDF est généré sans logo/cachet plutôt qu'aucun PDF du tout.
let LOGO_BUFFER: Buffer | null = null;
let STAMP_BUFFER: Buffer | null = null;
try {
  LOGO_BUFFER = fs.readFileSync(path.join(process.cwd(), 'public', 'logo_rgba.png'));
} catch (err) {
  console.error('[contract-pdf] logo_rgba.png introuvable:', err);
}
try {
  STAMP_BUFFER = fs.readFileSync(path.join(process.cwd(), 'private', 'stamp.png'));
} catch (err) {
  console.error('[contract-pdf] stamp.png introuvable:', err);
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#2C2C2C',
    padding: 40,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#C9A84C',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#C9A84C',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  articleTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1A1A1A',
    marginTop: 10,
    marginBottom: 3,
  },
  articleText: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.55,
    marginBottom: 2,
  },
  signatureSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0D98A',
    paddingTop: 14,
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
    marginBottom: 6,
  },
  signatureImg: {
    width: 160,
    height: 70,
    objectFit: 'contain',
  },
  stampImg: {
    width: 90,
    height: 90,
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
  metaInfo: {
    fontSize: 7.5,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

interface ContractPDFData {
  clientName: string;
  clientEmail: string;
  signedAt: Date;
  signatureDataUrl: string; // base64 PNG
  ipAddress?: string;
  version?: string;
}

const CONTRACT_TEXT = [
  {
    title: 'PRÉAMBULE',
    content: `Le présent contrat définit les conditions générales régissant le séjour de l'animal au sein de l'établissement DOG UNIVERSE, pension animale située à Marrakech.\nEn signant ce document, le propriétaire de l'animal (ci-après « le client ») reconnaît avoir pris connaissance de l'ensemble des dispositions et accepte les obligations réciproques entre lui-même et DOG UNIVERSE (ci-après « la pension »).`,
  },
  {
    title: 'Article 1 — Engagement de la pension',
    content: `DOG UNIVERSE s'engage à accueillir l'animal dans des conditions professionnelles garantissant sécurité, hygiène et bien-être.\nLa pension fournit notamment :\n• un espace de repos sécurisé • un accès permanent à l'eau potable • une surveillance quotidienne • un environnement propre et entretenu • des interactions adaptées.`,
  },
  {
    title: 'Article 2 — Conditions sanitaires et vaccinations',
    content: `Le client certifie que son animal est en bonne santé apparente au moment de l'admission. Le carnet de santé doit être présenté.\nVaccinations obligatoires — Chiens : rage • CHPPI (Carré, hépatite, parvovirose, parainfluenza, leptospirose) — Chats : rage • typhus • coryza.\nDOG UNIVERSE se réserve le droit de refuser l'admission d'un animal présentant : diarrhée • vomissements • toux • lésions suspectes • signes de maladie contagieuse.`,
  },
  {
    title: 'Article 3 — État de l\'animal à l\'admission',
    content: `Un contrôle visuel de l'animal est réalisé lors de l'arrivée. Toute anomalie visible pourra être signalée au client. En l'absence de remarque particulière, l'animal est considéré comme admis en bon état apparent.`,
  },
  {
    title: 'Article 4 — Informations obligatoires du client',
    content: `Le client s'engage à communiquer toutes les informations importantes concernant son animal :\n• habitudes alimentaires • allergies • traitements médicaux • comportement • antécédents de morsure • peurs ou particularités comportementales.\nToute omission engage la responsabilité du client.`,
  },
  {
    title: 'Article 5 — Alimentation et ration quotidienne',
    content: `Le client doit fournir la nourriture habituelle de son animal pour toute la durée du séjour, ou acheter l'alimentation directement auprès de DOG UNIVERSE. La nourriture fournie doit être clairement identifiée, en quantité suffisante et accompagnée du grammage quotidien habituel.\nDOG UNIVERSE peut ajuster raisonnablement les rations selon l'activité, le stress, les conditions climatiques ou l'état de l'animal.\nUn animal peut temporairement refuser de s'alimenter lors de l'adaptation. En cas de refus prolongé ou préoccupant, DOG UNIVERSE informera le client et pourra adapter l'alimentation ou consulter un vétérinaire (frais à la charge du client).\nSi la nourriture fournie est insuffisante, DOG UNIVERSE fournira une alimentation équivalente facturée au client.`,
  },
  {
    title: 'Article 6 — Femelles en chaleur',
    content: `Les femelles en chaleur peuvent être acceptées sous réserve de disponibilité. Un supplément de 30 DH par jour peut être appliqué.`,
  },
  {
    title: 'Article 7 — Responsabilité civile du propriétaire',
    content: `Le client demeure responsable du comportement de son animal. En cas de dommages causés par l'animal au personnel, à d'autres animaux ou aux installations, le client s'engage à assumer l'ensemble des frais.`,
  },
  {
    title: 'Article 8 — Jeux et interactions entre animaux',
    content: `Les interactions sociales et les jeux font partie du fonctionnement normal d'une pension. Malgré une surveillance adaptée, il peut survenir : griffures superficielles • morsures de jeu • irritations cutanées • blessures mineures.\nDOG UNIVERSE ne pourra être tenue responsable sauf en cas de manquement démontré à l'obligation de surveillance.`,
  },
  {
    title: 'Article 9 — Réactions allergiques',
    content: `Certains animaux peuvent présenter des réactions allergiques liées au stress, à l'environnement, à l'alimentation ou à des facteurs externes. DOG UNIVERSE ne pourra être tenue responsable de ces réactions en l'absence de faute.`,
  },
  {
    title: 'Article 10 — Stress et adaptation',
    content: `Le séjour en pension peut provoquer : diarrhée passagère • perte d'appétit • fatigue • modification comportementale. Ces réactions liées au changement d'environnement ne peuvent engager la responsabilité de la pension.`,
  },
  {
    title: 'Article 11 — Maladies contagieuses',
    content: `Certaines maladies peuvent être en incubation avant l'arrivée de l'animal, notamment : la parvovirose canine • la toux du chenil • certaines infections parasitaires.\nDOG UNIVERSE ne pourra être tenue responsable d'une maladie résultant d'une incubation antérieure à l'admission. La vaccination réduit le risque mais ne garantit pas une protection absolue.`,
  },
  {
    title: 'Article 12 — Urgences vétérinaires et mandat sanitaire',
    content: `En cas d'urgence médicale, DOG UNIVERSE contactera le client. Si celui-ci est injoignable, la pension est autorisée à consulter un vétérinaire.\nPar la signature du présent contrat, le client donne mandat sanitaire exprès à DOG UNIVERSE pour autoriser toute intervention vétérinaire jugée nécessaire en cas d'urgence. Le client s'engage à régler l'intégralité des frais vétérinaires.`,
  },
  {
    title: 'Article 13 — Modalités financières',
    content: `Paiement :\n• Séjour < 7 jours : paiement intégral\n• Séjour 7 jours à 1 mois : acompte 30 %\n• Séjour > 1 mois : acompte 50 %\nModes de paiement : espèces • virement • chèque.\nLes dates réservées constituent un engagement ferme. En cas de reprise anticipée de l'animal, l'intégralité du séjour réservé reste due. Tout jour entamé est dû.`,
  },
  {
    title: 'Article 14 — Sécurité sanitaire et obligations antiparasitaires',
    content: `DOG UNIVERSE applique des protocoles d'hygiène stricts. Le client doit justifier d'un traitement antiparasitaire administré dans les 30 jours précédant l'admission. L'admission peut être refusée en l'absence de traitement récent.\nSi des parasites sont détectés, DOG UNIVERSE procédera à un traitement curatif. Les frais ainsi qu'un forfait de désinfection (150 DH) seront facturés.`,
  },
  {
    title: 'Article 15 — Effets personnels',
    content: `DOG UNIVERSE décline toute responsabilité concernant la perte ou la détérioration d'objets personnels.`,
  },
  {
    title: 'Article 16 — Droit à l\'image',
    content: `Le client autorise DOG UNIVERSE à utiliser les photos et vidéos de son animal à des fins promotionnelles.`,
  },
  {
    title: 'Article 17 — Horaires d\'admission',
    content: `Horaires d'admission : Lundi au samedi : 10h00 – 17h00.\nToute admission hors horaires pourra être refusée ou facturée.`,
  },
  {
    title: 'Article 18 — Non récupération de l\'animal',
    content: `Le client doit récupérer son animal à la date prévue. Après 10 jours sans nouvelles et après l'envoi d'une mise en demeure, l'animal pourra être considéré comme abandonné. DOG UNIVERSE pourra le confier aux autorités ou à une association.`,
  },
  {
    title: 'Article 19 — Limitation de responsabilité',
    content: `La responsabilité de DOG UNIVERSE est limitée au montant total du séjour facturé, sauf en cas de faute lourde ou intentionnelle.`,
  },
  {
    title: 'Article 20 — Réclamations',
    content: `Toute réclamation doit être formulée par écrit dans un délai de 48 heures après le départ de l'animal.`,
  },
  {
    title: 'Article 21 — Données personnelles',
    content: `Les données collectées sont nécessaires à la gestion du séjour. Conformément à la loi marocaine 09-08, le client dispose d'un droit d'accès, de rectification et de suppression. Les données sont conservées 2 ans.`,
  },
  {
    title: 'Article 22 — Litiges',
    content: `Les parties rechercheront une solution amiable. À défaut, les tribunaux compétents seront ceux de Marrakech.`,
  },
  {
    title: 'Article 23 — Intégralité du contrat',
    content: `Le présent contrat constitue l'intégralité de l'accord entre les parties. Toute modification doit être faite par écrit.`,
  },
];

function ContractPDFDocument({ data }: { data: ContractPDFData }) {
  const signedAtStr = data.signedAt.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {LOGO_BUFFER && (
              <Image src={LOGO_BUFFER} style={{ width: 44, height: 44, objectFit: 'contain' }} />
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

        {/* Title */}
        <Text style={styles.title}>CONDITIONS GÉNÉRALES — CONTRAT DE PENSION ANIMALIÈRE</Text>
        <Text style={styles.subtitle}>DOG UNIVERSE SARLAU — Dr el Caid Souihla Saada, Marrakech, Maroc</Text>

        {/* Contract articles */}
        {CONTRACT_TEXT.map((article, idx) => (
          <View key={idx}>
            <Text style={styles.articleTitle}>{article.title}</Text>
            <Text style={styles.articleText}>{article.content}</Text>
          </View>
        ))}

        {/* Signature section */}
        <View style={styles.signatureSection}>
          {/* Client signature */}
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 8, color: '#374151', marginBottom: 6, fontStyle: 'italic' }}>
              {`Lu et accepté — J'ai pris connaissance des conditions générales ci-dessus et je les accepte sans réserve.`}
            </Text>
            <Text style={styles.signatureLabel}>Signature du client</Text>
            <Text style={{ fontSize: 8, color: '#374151', marginBottom: 4 }}>{data.clientName}</Text>
            <Image
              src={data.signatureDataUrl}
              style={styles.signatureImg}
            />
            <Text style={styles.metaInfo}>Signé le : {signedAtStr}</Text>
            {data.ipAddress && (
              <Text style={styles.metaInfo}>Adresse IP : {data.ipAddress}</Text>
            )}
          </View>

          {/* Stamp / Cachet */}
          <View style={{ ...styles.signatureBox, alignItems: 'flex-end' }}>
            <Text style={styles.signatureLabel}>{`Cachet de l'établissement`}</Text>
            {STAMP_BUFFER && (
              <Image
                src={STAMP_BUFFER}
                style={styles.stampImg}
              />
            )}
            <Text style={styles.metaInfo}>DOG UNIVERSE SARLAU</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {`Contrat version ${data.version ?? '1.0'} — Signé électroniquement par ${data.clientEmail} le ${signedAtStr}\nDOG UNIVERSE SARLAU — RC : 87023 — IF : 25081867 — ICE : 002035800000002 — Tél : 00212669183981 — contact@doguniverse.ma — Marrakech, Maroc`}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateContractPDF(data: ContractPDFData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ContractPDFDocument data={data} />);
  return buffer;
}
