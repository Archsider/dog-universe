import nodemailer from 'nodemailer';
import { petCompanion, petVerb, petArrived } from '../sms';

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

// Validate and sanitize email addresses — strips CRLF injection and enforces
// a basic format check to catch obviously malformed addresses early (before
// the SMTP layer rejects them with an opaque provider error).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function sanitizeEmail(addr: string): string {
  const cleaned = addr.replace(/[\r\n]/g, '');
  if (!EMAIL_RE.test(cleaned)) {
    throw new Error(`Invalid email address: ${cleaned.slice(0, 50)}`);
  }
  return cleaned;
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
      to: sanitizeEmail(to),
      subject: sanitizeSmtpHeader(subject),
      html,
      text: text ?? html.replace(/<[^>]*>/g, ''),
    });

  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'email', message: 'Failed to send email', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    // Don't throw - email failures shouldn't break the main flow
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type EmailTemplateName =
  | 'booking_confirmation'
  | 'booking_validated'
  | 'booking_refused'
  | 'booking_completed'
  | 'invoice_available'
  | 'invoice_paid'
  | 'reset_password'
  | 'booking_reminder'
  | 'stay_end_reminder'
  | 'admin_stay_reminder'
  | 'stay_photo'
  | 'admin_message'
  | 'loyalty_update'
  | 'loyalty_claim_approved'
  | 'loyalty_claim_rejected'
  | 'contract_reminder'
  | 'welcome'
  | 'admin_new_client';

export type EmailPet = { name?: string | null; species?: string | null; gender?: string | null };

export type EmailTemplateBodies = {
  subjectFr: string;
  subjectEn: string;
  bodyFr: string;
  bodyEn: string;
};

export type EmailTemplateContext = {
  d: Record<string, string>;
  isFr: boolean;
  _companion: string;
  _CompanionCap: string;
  _verbPres: string;
  _arrived: string;
  _pret: string;
  _recup: string;
  _companionFr: string;
  _companionEn: string;
  _animalLabelFr: string;
  _animalLabelEn: string;
  _animalLineFr: string;
  _animalLineEn: string;
  _dateRangeFr: string;
  _dateRangeEn: string;
};

export type EmailTemplateBuilder = (ctx: EmailTemplateContext) => EmailTemplateBodies;

export function buildTemplateContext(
  data: Record<string, string>,
  pets: EmailPet[],
  locale: string,
): EmailTemplateContext {
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

  const isFr = locale === 'fr';

  return {
    d,
    isFr,
    _companion,
    _CompanionCap,
    _verbPres,
    _arrived,
    _pret,
    _recup,
    _companionFr,
    _companionEn,
    _animalLabelFr,
    _animalLabelEn,
    _animalLineFr,
    _animalLineEn,
    _dateRangeFr,
    _dateRangeEn,
  };
}

export const baseStyle = `
    font-family: Georgia, serif;
    max-width: 600px;
    margin: 0 auto;
    background: #FEFCE8;
    border: 1px solid #F0D98A;
    border-radius: 8px;
    overflow: hidden;
  `;
export const headerStyle = `
    background: #2C2C2C;
    padding: 24px 32px;
    text-align: center;
  `;
export const titleStyle = `
    color: #C9A84C;
    font-size: 24px;
    margin: 0;
    font-family: 'Playfair Display', Georgia, serif;
  `;
export const bodyStyle = `padding: 32px;`;
export const footerStyle = `
    background: #F5EDD8;
    padding: 16px 32px;
    text-align: center;
    font-size: 12px;
    color: #6B7280;
  `;

export function wrapEmailHtml(body: string): string {
  return `
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
}
