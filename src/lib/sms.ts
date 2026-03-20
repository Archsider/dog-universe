/**
 * SMS helper — Android SMS Gateway
 *
 * Setup (gratuit, utilise ton forfait illimité Dog Universe) :
 * 1. Install "SMS Gateway for Android" (open-source, Igor Zarubin)
 *    → https://github.com/capcom6/android-sms-gateway
 *    ou cherche "SMS Gateway" sur le Play Store
 *
 * 2. Lance l'app sur ton téléphone Android (celui avec la SIM Dog Universe)
 *    → L'app affiche l'URL locale (ex: http://192.168.1.X:8080)
 *    → Pour accès depuis Internet : active "Cloud server" dans l'app (gratuit jusqu'à 100 SMS/mois)
 *      ou utilise un tunnel ngrok / ton serveur en local
 *
 * 3. Note le login/password affiché dans l'app
 *
 * 4. Dans .env.local :
 *    SMS_GATEWAY_URL=http://192.168.1.X:8080   (ou URL ngrok/cloud)
 *    SMS_GATEWAY_USER=admin
 *    SMS_GATEWAY_PASS=votre-mot-de-passe
 *    SMS_ENABLED=true
 *
 * Format des numéros marocains : +212XXXXXXXXX
 * (convertit automatiquement 06XXXXXXXX → +2126XXXXXXXX)
 */

interface SendSmsOptions {
  to: string;
  message: string;
}

interface SmsResult {
  ok: boolean;
  error?: string;
}

function normalizeMarocPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // 0612345678 → +212612345678
  if (digits.startsWith('0') && digits.length === 10) {
    return '+212' + digits.slice(1);
  }
  // 212612345678 → +212612345678
  if (digits.startsWith('212') && digits.length === 12) {
    return '+' + digits;
  }
  // Already normalized
  if (phone.startsWith('+')) return phone;
  return '+' + digits;
}

export async function sendSms({ to, message }: SendSmsOptions): Promise<SmsResult> {
  const enabled = process.env.SMS_ENABLED === 'true';
  const gatewayUrl = process.env.SMS_GATEWAY_URL;
  const user = process.env.SMS_GATEWAY_USER;
  const pass = process.env.SMS_GATEWAY_PASS;

  if (!enabled || !gatewayUrl) {
    // Always mask phone number in logs regardless of environment
    const maskedTo = to.length > 4 ? `${to.slice(0, 3)}****${to.slice(-2)}` : '****';
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SMS] (not configured) To: ${maskedTo} | ${message.slice(0, 30)}...`);
    }
    return { ok: true };
  }

  const phone = normalizeMarocPhone(to);

  try {
    const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
    const res = await fetch(`${gatewayUrl}/api/device/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        message,
        phoneNumbers: [phone],
        // Optional: ttl (time-to-live in seconds), priority, simNumber
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      console.error(`[SMS] Gateway error ${res.status}:`, err);
      return { ok: false, error: `Gateway ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error('[SMS] Send failed:', err);
    return { ok: false, error: String(err) };
  }
}

// ─── Pre-built templates ──────────────────────────────────────────────────────

export function smsBookingConfirmed(opts: {
  clientName: string;
  bookingRef: string;
  petNames: string;
  dates: string;
  locale?: string;
}): string {
  if (opts.locale === 'en') {
    return `Dog Universe ✓ Booking confirmed!\nRef: ${opts.bookingRef}\nPet(s): ${opts.petNames}\nDates: ${opts.dates}\nSee you soon!`;
  }
  return `Dog Universe ✓ Réservation confirmée !\nRéf: ${opts.bookingRef}\nAnimal(aux): ${opts.petNames}\nDates: ${opts.dates}\nÀ bientôt !`;
}

export function smsBookingReminder(opts: {
  clientName: string;
  petNames: string;
  date: string;
  locale?: string;
}): string {
  if (opts.locale === 'en') {
    return `Dog Universe 🐾 Reminder: ${opts.petNames}'s stay starts tomorrow (${opts.date}). See you then!`;
  }
  return `Dog Universe 🐾 Rappel : le séjour de ${opts.petNames} commence demain (${opts.date}). À demain !`;
}

export function smsBookingCancelled(opts: {
  bookingRef: string;
  locale?: string;
}): string {
  if (opts.locale === 'en') {
    return `Dog Universe — Booking ${opts.bookingRef} has been cancelled. Contact us for any questions.`;
  }
  return `Dog Universe — La réservation ${opts.bookingRef} a été annulée. Contactez-nous pour toute question.`;
}

export function smsInvoiceReady(opts: {
  invoiceNumber: string;
  amount: number;
  locale?: string;
}): string {
  if (opts.locale === 'en') {
    return `Dog Universe 📄 Invoice #${opts.invoiceNumber} is ready: ${opts.amount.toFixed(2)} MAD. Log in to view and download it.`;
  }
  return `Dog Universe 📄 Facture n°${opts.invoiceNumber} disponible : ${opts.amount.toFixed(2)} MAD. Connectez-vous pour la consulter.`;
}
