import nodemailer from 'nodemailer';
import { petCompanion, petVerb, petArrived } from './sms';

let transporter: nodemailer.Transporter;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (process.env.NODE_ENV === 'production') {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: parseInt(process.env.EMAIL_SERVER_PORT ?? '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    });
  } else {
    // Use Ethereal for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    // Intentionally not logging Ethereal credentials — use nodemailer.getTestMessageUrl() per send
  }

  return transporter;
}

// Prevent SMTP header injection (CVE nodemailer GHSA-vvjj-xcjg-gr5g / GHSA-c7w3-x93f-qmm8):
// Strip CR/LF characters from any value that ends up in an SMTP header line.
function sanitizeSmtpHeader(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM ?? '"Dog Universe" <noreply@doguniverse.ma>',
      to: sanitizeSmtpHeader(to),
      subject: sanitizeSmtpHeader(subject),
      html,
      text: text ?? html.replace(/<[^>]*>/g, ''),
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Email sent:', nodemailer.getTestMessageUrl(info));
    }
  } catch (error) {
    console.error('Failed to send email:', error);
    // Don't throw - email failures shouldn't break the main flow
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getEmailTemplate(
  type: 'booking_confirmation' | 'booking_validated' | 'booking_refused' | 'booking_completed' | 'invoice_available' | 'invoice_paid' | 'reset_password' | 'booking_reminder' | 'stay_end_reminder' | 'admin_stay_reminder' | 'stay_photo' | 'admin_message' | 'loyalty_update' | 'loyalty_claim_approved' | 'loyalty_claim_rejected' | 'contract_reminder' | 'welcome' | 'admin_new_client',
  data: Record<string, string>,
  locale: string = 'fr',
  pets: { name?: string | null; species?: string | null; gender?: string | null }[] = [],
): { subject: string; html: string } {
  // Escape all user-supplied fields to prevent XSS in email HTML
  const d: Record<string, string> = {};
  for (const [key, val] of Object.entries(data)) {
    // URL fields must not be escaped (they go in href attributes as-is)
    d[key] = (key === 'resetUrl' || key === 'loginUrl') ? val : escapeHtml(val ?? '');
  }

  // Pet names from DB are user-controlled — must be HTML-escaped before
  // injection into email templates (XSS via name like `<script>...</script>`).
  // Species/gender are server-controlled enums, no escaping needed.
  const safePets = pets.map(p => ({
    ...p,
    name: p.name ? escapeHtml(p.name) : p.name,
  }));

  // Genre / pluriel — fallback masculin singulier si pets vide.
  // Seuls les helpers réellement utilisés par les templates ci-dessous sont calculés.
  const hasPets = safePets.length > 0;
  const allFemale = hasPets && safePets.every(p => p.gender === 'FEMALE');
  const isPlural = safePets.length > 1;
  const _companion = hasPets ? petCompanion(safePets) : 'votre compagnon';
  const _CompanionCap = _companion.charAt(0).toUpperCase() + _companion.slice(1);
  const _verbPres  = hasPets ? petVerb(safePets, 'present') : 'est';
  const _arrived   = hasPets ? petArrived(safePets)   : 'arrivé(e)';
  const _pret = !hasPets ? 'prêt(e)' : isPlural ? (allFemale ? 'prêtes' : 'prêts') : (allFemale ? 'prête' : 'prêt');
  const _recup = !hasPets ? 'récupéré(e)' : isPlural ? (allFemale ? 'récupérées' : 'récupérés') : (allFemale ? 'récupérée' : 'récupéré');

  // Helpers booking_validated : noms d'animaux groupés par espèce + accord _companion avec prénoms.
  // joinNames : "Max" / "Max et Luna" / "Max, Rex et Luna" — virgule sauf avant le dernier.
  const joinNames = (names: string[]): string => {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} et ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
  };
  const joinNamesEn = (names: string[]): string => {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };

  // _companionFr/_companionEn : pronoms accordés + prénoms (ordre d'entrée).
  // Si aucun nom (pets vide ou tous null) → fallback sans prénom.
  const _allNames = safePets.map(p => p.name).filter((n): n is string => !!n);
  const _companionFr = _allNames.length > 0 ? `${_companion} ${joinNames(_allNames)}` : _companion;
  const _companionEn = _allNames.length > 0
    ? `your companion${isPlural ? 's' : ''} ${joinNamesEn(_allNames)}`
    : `your companion${isPlural ? 's' : ''}`;

  // Ligne "Animal(aux) : ..." — groupée par espèce, chaque groupe trié alphabétiquement.
  // 1 seul groupe → joinNames (et + virgules). Plusieurs groupes → virgules dans chaque
  // groupe, " et " réservé pour séparer les groupes (sinon "Max et Luna et Mimi" ambigu).
  // Espèces null → groupe "autres" sans parenthèses. Pets vide → fallback d.petName.
  const _animalLabelFr = isPlural ? 'Animaux' : 'Animal';
  const _animalLabelEn = isPlural ? 'Pets' : 'Pet';
  const buildAnimalLine = (
    speciesLabel: (sp: 'DOG' | 'CAT', plural: boolean) => string,
    joinAcross: (parts: string[]) => string,
  ): string => {
    if (!hasPets) return '';
    const sortByName = (a: { name?: string | null }, b: { name?: string | null }) =>
      (a.name ?? '').localeCompare(b.name ?? '');
    const dogs = safePets.filter(p => p.species === 'DOG').sort(sortByName);
    const cats = safePets.filter(p => p.species === 'CAT').sort(sortByName);
    const others = safePets.filter(p => p.species !== 'DOG' && p.species !== 'CAT').sort(sortByName);
    type GroupRaw = { names: string[]; sp: 'DOG' | 'CAT' | null; count: number };
    const groupsRaw: GroupRaw[] = [];
    const collect = (list: typeof safePets, sp: 'DOG' | 'CAT' | null) => {
      const names = list.map(p => p.name).filter((n): n is string => !!n);
      if (names.length > 0) groupsRaw.push({ names, sp, count: list.length });
    };
    collect(dogs, 'DOG');
    collect(cats, 'CAT');
    collect(others, null);
    if (groupsRaw.length === 0) return '';
    const singleGroup = groupsRaw.length === 1;
    const groups = groupsRaw.map(g => {
      const joined = singleGroup ? joinAcross(g.names) : g.names.join(', ');
      return g.sp ? `${joined} (${speciesLabel(g.sp, g.count > 1)})` : joined;
    });
    return joinAcross(groups);
  };
  const _animalLineFr = (() => {
    const line = buildAnimalLine(
      (sp, plural) => sp === 'DOG' ? (plural ? 'chiens' : 'chien') : (plural ? 'chats' : 'chat'),
      joinNames,
    );
    return line || d.petName;
  })();
  const _animalLineEn = (() => {
    const line = buildAnimalLine(
      (sp, plural) => sp === 'DOG' ? (plural ? 'dogs' : 'dog') : (plural ? 'cats' : 'cat'),
      joinNamesEn,
    );
    return line || d.petName;
  })();

  // Plage de dates booking_validated : "Du X au Y" si endDate présente, sinon "Le X".
  const _dateRangeFr = d.endDate ? `Du ${d.startDate} au ${d.endDate}` : `Le ${d.startDate}`;
  const _dateRangeEn = d.endDate ? `From ${d.startDate} to ${d.endDate}` : `On ${d.startDate}`;
  const baseStyle = `
    font-family: Georgia, serif;
    max-width: 600px;
    margin: 0 auto;
    background: #FEFCE8;
    border: 1px solid #F0D98A;
    border-radius: 8px;
    overflow: hidden;
  `;
  const headerStyle = `
    background: #2C2C2C;
    padding: 24px 32px;
    text-align: center;
  `;
  const titleStyle = `
    color: #C9A84C;
    font-size: 24px;
    margin: 0;
    font-family: 'Playfair Display', Georgia, serif;
  `;
  const bodyStyle = `padding: 32px;`;
  const footerStyle = `
    background: #F5EDD8;
    padding: 16px 32px;
    text-align: center;
    font-size: 12px;
    color: #6B7280;
  `;

  const isFr = locale === 'fr';

  const templates: Record<string, { subjectFr: string; subjectEn: string; bodyFr: string; bodyEn: string }> = {
    booking_confirmation: {
      subjectFr: '✅ Votre demande de réservation a bien été reçue — Dog Universe',
      subjectEn: '✅ Your booking request has been received — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous avons bien reçu votre demande de réservation <strong>${d.bookingRef}</strong>.</p>
        <p>Notre équipe la traitera sous <strong>24 heures</strong>. Vous recevrez une notification de confirmation dès validation.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service} | Animal : ${d.petName}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We have received your booking request <strong>${d.bookingRef}</strong>.</p>
        <p>Our team will process it within <strong>24 hours</strong>. You will receive a confirmation notification once validated.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service} | Pet: ${d.petName}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_validated: {
      subjectFr: '✅ Réservation confirmée — Dog Universe',
      subjectEn: '✅ Booking confirmed — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Excellente nouvelle ! Votre réservation <strong>${d.bookingRef}</strong> a été <strong style="color: #16a34a;">confirmée</strong>.</p>
        <p>Nous attendons ${_companionFr} avec impatience.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service} | ${_animalLabelFr} : ${_animalLineFr} | Dates : ${_dateRangeFr}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Great news! Your booking <strong>${d.bookingRef}</strong> has been <strong style="color: #16a34a;">confirmed</strong>.</p>
        <p>We look forward to welcoming ${_companionEn}.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service} | ${_animalLabelEn}: ${_animalLineEn} | Dates: ${_dateRangeEn}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_refused: {
      subjectFr: 'ℹ️ Réservation non disponible — Dog Universe',
      subjectEn: 'ℹ️ Booking unavailable — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous sommes désolés de vous informer que votre demande de réservation <strong>${d.bookingRef}</strong> ne peut pas être honorée.</p>
        ${d.reason ? `<p>Motif : ${d.reason}</p>` : ''}
        <p>N'hésitez pas à nous contacter ou à soumettre une nouvelle demande pour d'autres dates.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We regret to inform you that your booking request <strong>${d.bookingRef}</strong> cannot be accommodated.</p>
        ${d.reason ? `<p>Reason: ${d.reason}</p>` : ''}
        <p>Please feel free to contact us or submit a new request for other dates.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_completed: {
      subjectFr: d.serviceType === 'PET_TAXI'
        ? `🏁 Trajet terminé — Dog Universe`
        : d.hasGrooming === 'true'
          ? `✅ Séjour & toilettage terminés — Dog Universe`
          : `✅ Séjour terminé — Dog Universe`,
      subjectEn: d.serviceType === 'PET_TAXI'
        ? `🏁 Trip completed — Dog Universe`
        : d.hasGrooming === 'true'
          ? `✅ Stay & grooming completed — Dog Universe`
          : `✅ Stay completed — Dog Universe`,
      bodyFr: d.serviceType === 'PET_TAXI'
        ? `
          <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
          <p>Votre trajet Pet Taxi (réf. <strong>${d.bookingRef}</strong>) est terminé.</p>
          <p><strong>${d.petName}</strong> ${_verbPres} ${_arrived} à destination en toute sécurité.</p>
          <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
        `
        : d.hasGrooming === 'true'
          ? `
            <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
            <p>Le séjour et le toilettage de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) sont maintenant terminés.</p>
            <p>${_CompanionCap} ${_verbPres} ${_pret} à être ${_recup}. N'hésitez pas à nous contacter pour convenir de l'heure de passage.</p>
            <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
          `
          : `
            <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
            <p>Le séjour de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) est maintenant terminé.</p>
            <p>${_CompanionCap} ${_verbPres} ${_pret} à être ${_recup}. N'hésitez pas à nous contacter pour convenir de l'heure de passage.</p>
            <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
          `,
      bodyEn: d.serviceType === 'PET_TAXI'
        ? `
          <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
          <p>Your Pet Taxi trip (ref. <strong>${d.bookingRef}</strong>) is now complete.</p>
          <p><strong>${d.petName}</strong> has arrived safely at the destination.</p>
          <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
        `
        : d.hasGrooming === 'true'
          ? `
            <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
            <p><strong>${d.petName}</strong>'s stay and grooming (ref. <strong>${d.bookingRef}</strong>) are now complete.</p>
            <p>Your companion is ready to be picked up. Feel free to contact us to arrange a pick-up time.</p>
            <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
          `
          : `
            <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
            <p><strong>${d.petName}</strong>'s stay (ref. <strong>${d.bookingRef}</strong>) is now complete.</p>
            <p>Your companion is ready to be picked up. Feel free to contact us to arrange a pick-up time.</p>
            <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
          `,
    },
    invoice_available: {
      subjectFr: `📄 Votre facture ${d.invoiceNumber} est disponible — Dog Universe`,
      subjectEn: `📄 Your invoice ${d.invoiceNumber} is available — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Votre facture <strong>${d.invoiceNumber}</strong> d'un montant de <strong>${d.amount}</strong> est maintenant disponible dans votre espace client.</p>
        <p>Connectez-vous pour la consulter et la télécharger en PDF.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Your invoice <strong>${d.invoiceNumber}</strong> for <strong>${d.amount}</strong> is now available in your client portal.</p>
        <p>Log in to view and download it as PDF.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_reminder: {
      subjectFr: `🐾 Rappel : votre séjour commence demain — Dog Universe`,
      subjectEn: `🐾 Reminder: your stay starts tomorrow — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Petit rappel : votre réservation <strong>${d.bookingRef}</strong> pour <strong>${d.petName}</strong> commence <strong>demain</strong>, le <strong>${d.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service}</p>
        <p>Si vous avez des questions ou souhaitez modifier votre réservation, n'hésitez pas à nous contacter.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Just a reminder: your booking <strong>${d.bookingRef}</strong> for <strong>${d.petName}</strong> starts <strong>tomorrow</strong>, on <strong>${d.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service}</p>
        <p>If you have any questions or would like to modify your booking, please feel free to contact us.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    stay_end_reminder: {
      subjectFr: `🏠 Fin de séjour demain — ${d.petName} — Dog Universe`,
      subjectEn: `🏠 Stay ending tomorrow — ${d.petName} — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Le séjour de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) se termine <strong>demain</strong>, le <strong>${d.endDate}</strong>.</p>
        <p>Pensez à prévoir votre venue pour récupérer ${_companion}. N'hésitez pas à nous contacter pour convenir de l'heure.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p><strong>${d.petName}</strong>'s stay (ref. <strong>${d.bookingRef}</strong>) ends <strong>tomorrow</strong>, on <strong>${d.endDate}</strong>.</p>
        <p>Please plan your visit to pick up your companion. Feel free to contact us to arrange a pick-up time.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    admin_stay_reminder: {
      subjectFr: `📋 Rappel séjour demain — ${d.petName} (${d.clientName}) — Dog Universe`,
      subjectEn: `📋 Stay reminder tomorrow — ${d.petName} (${d.clientName}) — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Rappel séjour</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px;"><strong>Client :</strong> ${d.clientName}</p>
          <p style="margin: 0 0 6px;"><strong>Animal(aux) :</strong> ${d.petName}</p>
          <p style="margin: 0 0 6px;"><strong>Réf. :</strong> ${d.bookingRef}</p>
          <p style="margin: 0;"><strong>${d.reminderType === 'start' ? 'Arrivée' : 'Départ'} :</strong> demain le ${d.date}</p>
        </div>
        <p style="color: #6B7280; font-size: 13px;">Ce rappel automatique est envoyé la veille de l'arrivée ou du départ.</p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Stay reminder</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px;"><strong>Client:</strong> ${d.clientName}</p>
          <p style="margin: 0 0 6px;"><strong>Pet(s):</strong> ${d.petName}</p>
          <p style="margin: 0 0 6px;"><strong>Ref:</strong> ${d.bookingRef}</p>
          <p style="margin: 0;"><strong>${d.reminderType === 'start' ? 'Check-in' : 'Check-out'}:</strong> tomorrow ${d.date}</p>
        </div>
        <p style="color: #6B7280; font-size: 13px;">This automatic reminder is sent the day before check-in or check-out.</p>
      `,
    },
    invoice_paid: {
      subjectFr: `✅ Paiement confirmé — Facture ${d.invoiceNumber} — Dog Universe`,
      subjectEn: `✅ Payment confirmed — Invoice ${d.invoiceNumber} — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous confirmons la bonne réception de votre paiement pour la facture <strong>${d.invoiceNumber}</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #2C2C2C;">Montant réglé : ${d.amount}</p>
        </div>
        <p>Connectez-vous à votre espace client pour télécharger votre facture en PDF.</p>
        <p>Merci pour votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We confirm receipt of your payment for invoice <strong>${d.invoiceNumber}</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #2C2C2C;">Amount paid: ${d.amount}</p>
        </div>
        <p>Log in to your client portal to download your invoice as PDF.</p>
        <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    stay_photo: {
      subjectFr: `📸 Nouvelles photos de ${d.petName} disponibles — Dog Universe`,
      subjectEn: `📸 New photos of ${d.petName} available — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>De nouvelles photos de <strong>${d.petName}</strong> ont été publiées pour votre réservation <strong>${d.bookingRef}</strong>.</p>
        <p>Connectez-vous à votre espace client pour les consulter !</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>New photos of <strong>${d.petName}</strong> have been posted for your booking <strong>${d.bookingRef}</strong>.</p>
        <p>Log in to your client portal to see them!</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    admin_message: {
      subjectFr: `💬 Message de Dog Universe`,
      subjectEn: `💬 Message from Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${d.message}</p>
        </div>
        ${d.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Réservation : ${d.bookingRef}</p>` : ''}
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${d.message}</p>
        </div>
        ${d.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Booking: ${d.bookingRef}</p>` : ''}
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    loyalty_update: {
      subjectFr: `⭐ Votre grade de fidélité a évolué — Dog Universe`,
      subjectEn: `⭐ Your loyalty grade has been updated — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Félicitations ! Votre fidélité a été récompensée.</p>
        <p>Votre grade est maintenant : <strong style="color: #C9A84C; font-size: 18px;">${d.grade}</strong></p>
        ${d.totalStays ? `<p style="color: #6B7280; font-size: 14px;">Séjours complétés : ${d.totalStays}</p>` : ''}
        <p>Connectez-vous à votre espace client pour découvrir vos nouveaux avantages.</p>
        <p>Merci pour votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Congratulations! Your loyalty has been rewarded.</p>
        <p>Your grade is now: <strong style="color: #C9A84C; font-size: 18px;">${d.grade}</strong></p>
        ${d.totalStays ? `<p style="color: #6B7280; font-size: 14px;">Completed stays: ${d.totalStays}</p>` : ''}
        <p>Log in to your client portal to discover your new benefits.</p>
        <p>Thank you for your loyalty,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    loyalty_claim_approved: {
      subjectFr: `✅ Votre avantage fidélité a été accordé — Dog Universe`,
      subjectEn: `✅ Your loyalty benefit has been granted — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Excellente nouvelle ! Votre demande d'avantage a été <strong style="color: #16a34a;">accordée</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold; color: #2C2C2C;">${d.benefitFr}</p>
        </div>
        <p>Notre équipe prendra contact avec vous pour la mise en place de cet avantage.</p>
        <p>Merci pour votre fidélité,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Great news! Your benefit request has been <strong style="color: #16a34a;">approved</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold; color: #2C2C2C;">${d.benefitEn}</p>
        </div>
        <p>Our team will contact you shortly to arrange this benefit.</p>
        <p>Thank you for your loyalty,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    loyalty_claim_rejected: {
      subjectFr: `ℹ️ Votre réclamation d'avantage fidélité — Dog Universe`,
      subjectEn: `ℹ️ Your loyalty benefit claim — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Votre demande pour l'avantage <strong>${d.benefitFr}</strong> n'a malheureusement pas pu être accordée.</p>
        ${d.reason ? `<div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin: 16px 0;"><p style="margin: 0; color: #991B1B;">Motif : ${d.reason}</p></div>` : ''}
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Unfortunately, your request for the benefit <strong>${d.benefitEn}</strong> could not be approved.</p>
        ${d.reason ? `<div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin: 16px 0;"><p style="margin: 0; color: #991B1B;">Reason: ${d.reason}</p></div>` : ''}
        <p>If you have any questions, please feel free to contact us.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    contract_reminder: {
      subjectFr: '⚠️ Action requise : signature de votre contrat — Dog Universe',
      subjectEn: '⚠️ Action required: sign your contract — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Votre <strong>contrat d'hébergement</strong> est obligatoire pour accéder à votre espace client Dog Universe.</p>
        <p>Pour le signer, connectez-vous à votre espace — le contrat vous sera présenté automatiquement :</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${d.loginUrl}" style="display: inline-block; background: #C9A84C; color: white; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px;">
            Accéder à mon espace
          </a>
        </div>
        <p style="color: #999; font-size: 13px;">Si vous avez des questions, n'hésitez pas à nous contacter par email ou téléphone.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Your <strong>boarding contract</strong> is required to access your Dog Universe client area.</p>
        <p>To sign it, log in to your account — the contract will be presented to you automatically:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${d.loginUrl}" style="display: inline-block; background: #C9A84C; color: white; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px;">
            Access my account
          </a>
        </div>
        <p style="color: #999; font-size: 13px;">If you have any questions, feel free to contact us by email or phone.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    welcome: {
      subjectFr: '🐾 Bienvenue chez Dog Universe !',
      subjectEn: '🐾 Welcome to Dog Universe!',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Bienvenue chez <strong>Dog Universe</strong> — la pension animale de référence à Marrakech.</p>
        <p>Votre compte a été créé avec succès. Vous pouvez dès maintenant :</p>
        <ul style="color: #4B5563; line-height: 1.8;">
          <li>Réserver un séjour ou un Pet Taxi pour votre animal</li>
          <li>Suivre vos réservations en temps réel</li>
          <li>Accéder à vos factures et les télécharger en PDF</li>
          <li>Profiter de notre programme de fidélité</li>
        </ul>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.loginUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Accéder à mon espace
          </a>
        </p>
        <p>À très bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Welcome to <strong>Dog Universe</strong> — Marrakech's premier pet boarding facility.</p>
        <p>Your account has been created successfully. You can now:</p>
        <ul style="color: #4B5563; line-height: 1.8;">
          <li>Book a boarding stay or Pet Taxi for your pet</li>
          <li>Track your bookings in real time</li>
          <li>Access and download your invoices as PDF</li>
          <li>Enjoy our loyalty rewards program</li>
        </ul>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.loginUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Access my account
          </a>
        </p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    admin_new_client: {
      subjectFr: `🐾 Nouveau client inscrit — ${d.clientName}`,
      subjectEn: `🐾 New client registered — ${d.clientName}`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Nouveau client inscrit</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: bold; color: #2C2C2C;">${d.clientName}</p>
          <p style="margin: 0 0 4px; color: #4B5563;">${d.clientEmail}</p>
          ${d.clientPhone ? `<p style="margin: 0; color: #4B5563;">${d.clientPhone}</p>` : ''}
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.clientUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Voir la fiche client
          </a>
        </p>
        <p style="color: #6B7280; font-size: 12px; text-align: center;">Inscrit le ${new Date(d.registeredAt).toLocaleString('fr-FR')}</p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">New client registered</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: bold; color: #2C2C2C;">${d.clientName}</p>
          <p style="margin: 0 0 4px; color: #4B5563;">${d.clientEmail}</p>
          ${d.clientPhone ? `<p style="margin: 0; color: #4B5563;">${d.clientPhone}</p>` : ''}
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.clientUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View client profile
          </a>
        </p>
        <p style="color: #6B7280; font-size: 12px; text-align: center;">Registered on ${new Date(d.registeredAt).toLocaleString('en-GB')}</p>
      `,
    },
    reset_password: {
      subjectFr: '🔒 Réinitialisation de votre mot de passe — Dog Universe',
      subjectEn: '🔒 Reset your password — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour,</h2>
        <p>Vous avez demandé la réinitialisation de votre mot de passe Dog Universe.</p>
        <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.resetUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p style="color: #6B7280; font-size: 13px;">Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello,</h2>
        <p>You have requested a password reset for your Dog Universe account.</p>
        <p>Click the button below to set a new password:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${d.resetUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Reset my password
          </a>
        </p>
        <p style="color: #6B7280; font-size: 13px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
  };

  const template = templates[type];
  if (!template) throw new Error(`Unknown email template: ${type}`);

  const subject = isFr ? template.subjectFr : template.subjectEn;
  const body = isFr ? template.bodyFr : template.bodyEn;

  const html = `
    <div style="${baseStyle}">
      <div style="${headerStyle}">
        <h1 style="${titleStyle}">Dog Universe</h1>
        <p style="color: #9CA3AF; margin: 4px 0 0; font-size: 13px;">Marrakech, Maroc</p>
      </div>
      <div style="${bodyStyle}">
        ${body}
      </div>
      <div style="${footerStyle}">
        <p>Dog Universe — Marrakech, Maroc</p>
        <p>contact@doguniverse.ma | www.doguniverse.ma</p>
      </div>
    </div>
  `;

  return { subject, html };
}
