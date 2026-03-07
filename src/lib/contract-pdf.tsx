import React from 'react';
import path from 'path';
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const LOGO_PATH = path.resolve(process.cwd(), 'public', 'logo_rgba.png');
// stamp.png est dans /private/ (PAS dans /public/) → jamais servi comme fichier statique
const STAMP_PATH = path.resolve(process.cwd(), 'private', 'stamp.png');

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
    content: `Le présent contrat établit les conditions générales régissant le séjour de votre animal dans notre établissement DOG UNIVERSE. En signant ce contrat, le propriétaire (ci-après "le client") accepte l'ensemble des conditions ci-dessous.`,
  },
  {
    title: 'Article 1 — Engagement de la pension',
    content: `DOG UNIVERSE s'engage à accueillir votre animal dans les meilleures conditions possibles, en lui fournissant les soins nécessaires, une alimentation adaptée et un environnement sécurisé. La pension dispose de toutes les autorisations nécessaires à l'exercice de son activité.`,
  },
  {
    title: 'Article 2 — Santé, vaccinations et antiparasitaire',
    content: `Tous les animaux accueillis doivent être en bonne santé apparente au moment du dépôt. Le client s'engage à fournir le carnet de santé de l'animal avec les vaccinations à jour obligatoires (rage, typhus, coryza pour les chats ; rage, CHPPI pour les chiens). Un traitement antiparasitaire (puce et ver) doit avoir été administré dans les 30 jours précédant le séjour. Tout animal présentant des signes de maladie contagieuse pourra être refusé ou isolé. La pension ne saurait être tenue responsable des maladies contractées par voie aérienne ou contact indirect.`,
  },
  {
    title: 'Article 3 — Alimentation',
    content: `La pension fournit une alimentation de qualité adaptée à chaque animal. Le client peut fournir la nourriture habituelle de son animal pour éviter tout trouble digestif lié au changement d'alimentation. Les régimes spéciaux et médicamenteux doivent être signalés à l'admission et accompagnés d'une ordonnance si nécessaire.`,
  },
  {
    title: 'Article 4 — Informations obligatoires',
    content: `Le client s'engage à fournir toutes les informations nécessaires concernant les habitudes, comportements particuliers, traitements médicaux en cours, et tout antécédent de morsure ou d'agressivité de l'animal. Toute dissimulation d'information pouvant mettre en danger le personnel ou les autres animaux engage la responsabilité exclusive du client.`,
  },
  {
    title: 'Article 5 — Femelles en chaleur',
    content: `Les femelles en chaleur sont acceptées sous réserve de disponibilité. Un supplément tarifaire de 30 DH/jour sera appliqué pour les contraintes supplémentaires de gestion. Le client doit informer la pension de l'état de chaleur de son animal au moment de la réservation.`,
  },
  {
    title: 'Article 6 — Urgences médicales',
    content: `En cas d'urgence médicale, DOG UNIVERSE s'engage à contacter immédiatement le client ou son représentant désigné. Si le client est injoignable, la pension est autorisée à faire appel à un vétérinaire d'urgence. Les frais vétérinaires engagés dans ce cadre sont intégralement à la charge du client. La pension ne saurait être tenue responsable du décès ou de la détérioration de l'état de santé d'un animal nécessitant des soins vétérinaires urgents.`,
  },
  {
    title: 'Article 7 — Modalités financières',
    content: `Le tarif applicable est celui en vigueur au jour de la réservation. Pour les séjours supérieurs à un mois, un acompte de 50% est exigé à la réservation. Le jour de départ est comptabilisé dans la durée du séjour. Le solde est dû intégralement au moment du départ de l'animal.`,
  },
  {
    title: 'Article 8 — Annulation et départ anticipé',
    content: `Toute annulation intervenant moins de 72 heures avant la date prévue de dépôt, ou tout départ anticipé, donnera lieu à la facturation de 50% du montant total du séjour prévu. Les cas de force majeure seront examinés individuellement.`,
  },
  {
    title: 'Article 9 — Hygiène et responsabilité',
    content: `La pension maintient des standards élevés d'hygiène et de propreté. Tout animal présentant une parasitose lors de son admission sera traité aux frais du client. La pension décline toute responsabilité en cas d'accident, blessure ou décès résultant d'une bagarre entre animaux ou d'un comportement imprévisible de l'animal.`,
  },
  {
    title: 'Article 10 — Effets personnels',
    content: `La pension ne saurait être tenue responsable de la perte, dégradation ou destruction d'effets personnels (jouets, coussins, laisses, etc.) apportés par le client. Il est conseillé de limiter les objets personnels au strict nécessaire.`,
  },
  {
    title: 'Article 11 — Droit à l\'image',
    content: `Le client autorise DOG UNIVERSE à prendre des photos et vidéos de son animal durant le séjour, et à les publier sur les réseaux sociaux et supports de communication de la pension, à des fins promotionnelles uniquement. Le client peut refuser cette autorisation en le signalant expressément à l'admission.`,
  },
  {
    title: 'Article 12 — Refus d\'admission',
    content: `DOG UNIVERSE se réserve le droit de refuser tout animal présentant un danger pour le personnel ou les autres pensionnaires, dont les vaccinations sont insuffisantes, ou dont l'état de santé nécessite des soins vétérinaires immédiats.`,
  },
  {
    title: 'Article 13 — Réserves et réclamations',
    content: `Toute réclamation concernant le séjour devra être formulée dans un délai de 48 heures suivant le départ de l'animal. Passé ce délai, aucune réclamation ne pourra être prise en compte. En cas de litige, les parties s'engagent à rechercher une solution amiable avant tout recours judiciaire.`,
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
            <Image src={LOGO_PATH} style={{ width: 44, height: 44, objectFit: 'contain' }} />
            <View>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#C9A84C' }}>DOG UNIVERSE</Text>
              <Text style={{ fontSize: 7.5, color: '#9CA3AF', marginTop: 2 }}>Pension & Services pour animaux — Marrakech</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#6B7280' }}>RC : 87023 — ICE : 002035800000002</Text>
            <Text style={{ fontSize: 8, color: '#6B7280', marginTop: 2 }}>+212 669 183 981</Text>
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
            <Text style={styles.signatureLabel}>Cachet de l'établissement</Text>
            <Image
              src={STAMP_PATH}
              style={styles.stampImg}
            />
            <Text style={styles.metaInfo}>DOG UNIVERSE SARLAU</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {`Contrat version ${data.version ?? '1.0'} — Signé électroniquement par ${data.clientEmail} le ${signedAtStr}\nDOG UNIVERSE SARLAU — RC 87023 — ICE 002035800000002 — Marrakech, Maroc`}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateContractPDF(data: ContractPDFData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ContractPDFDocument data={data} />);
  return buffer;
}
