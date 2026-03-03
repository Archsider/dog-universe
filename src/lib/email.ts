import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (process.env.NODE_ENV === 'production') {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: parseInt(process.env.EMAIL_SERVER_PORT ?? '587'),
      secure: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
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
  }

  return transporter;
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
}): Promise<{ success: boolean; error?: string; previewUrl?: string }> {
  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM ?? '"Dog Universe" <noreply@doguniverse.ma>',
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]*>/g, ''),
    });

    if (process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 EMAIL DEV — L\'email N\'est PAS envoyé réellement');
      console.log(`   À : ${to}`);
      console.log(`   Sujet : ${subject}`);
      if (previewUrl) console.log(`   Voir l'email ici : ${previewUrl}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      return { success: true, previewUrl: typeof previewUrl === 'string' ? previewUrl : undefined };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === 'production') {
      console.error('[EMAIL ERROR] Échec envoi email', {
        to,
        subject,
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        user: process.env.EMAIL_SERVER_USER,
        error: message,
      });
    } else {
      console.error('[EMAIL ERROR]', message);
    }
    return { success: false, error: message };
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text ?? '').replace(/[&<>"']/g, m => map[m]);
}

export function getEmailTemplate(type: 'booking_confirmation' | 'booking_validated' | 'booking_refused' | 'invoice_available' | 'reset_password' | 'booking_reminder' | 'stay_photo' | 'admin_message' | 'welcome' | 'admin_new_client' | 'email_verification', rawData: Record<string, string>, locale: string = 'fr'): { subject: string; html: string } {
  // Escape all user-supplied data to prevent XSS in email HTML
  const data = Object.fromEntries(Object.entries(rawData).map(([k, v]) => [k, escapeHtml(v)]));
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
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Nous avons bien reçu votre demande de réservation <strong>${data.bookingRef}</strong>.</p>
        <p>Notre équipe la traitera sous <strong>24 heures</strong>. Vous recevrez une notification de confirmation dès validation.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${data.service} | Animal : ${data.petName}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>We have received your booking request <strong>${data.bookingRef}</strong>.</p>
        <p>Our team will process it within <strong>24 hours</strong>. You will receive a confirmation notification once validated.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${data.service} | Pet: ${data.petName}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_validated: {
      subjectFr: '✅ Réservation confirmée — Dog Universe',
      subjectEn: '✅ Booking confirmed — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Excellente nouvelle ! Votre réservation <strong>${data.bookingRef}</strong> a été <strong style="color: #16a34a;">confirmée</strong>.</p>
        <p>Nous attendons votre compagnon avec impatience.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${data.service} | Animal : ${data.petName} | Dates : ${data.dates}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>Great news! Your booking <strong>${data.bookingRef}</strong> has been <strong style="color: #16a34a;">confirmed</strong>.</p>
        <p>We look forward to welcoming your companion.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${data.service} | Pet: ${data.petName} | Dates: ${data.dates}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_refused: {
      subjectFr: 'ℹ️ Réservation non disponible — Dog Universe',
      subjectEn: 'ℹ️ Booking unavailable — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Nous sommes désolés de vous informer que votre demande de réservation <strong>${data.bookingRef}</strong> ne peut pas être honorée.</p>
        ${data.reason ? `<p>Motif : ${data.reason}</p>` : ''}
        <p>N'hésitez pas à nous contacter ou à soumettre une nouvelle demande pour d'autres dates.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>We regret to inform you that your booking request <strong>${data.bookingRef}</strong> cannot be accommodated.</p>
        ${data.reason ? `<p>Reason: ${data.reason}</p>` : ''}
        <p>Please feel free to contact us or submit a new request for other dates.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    invoice_available: {
      subjectFr: `📄 Votre facture ${data.invoiceNumber} est disponible — Dog Universe`,
      subjectEn: `📄 Your invoice ${data.invoiceNumber} is available — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Votre facture <strong>${data.invoiceNumber}</strong> d'un montant de <strong>${data.amount}</strong> est maintenant disponible dans votre espace client.</p>
        <p>Connectez-vous pour la consulter et la télécharger en PDF.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>Your invoice <strong>${data.invoiceNumber}</strong> for <strong>${data.amount}</strong> is now available in your client portal.</p>
        <p>Log in to view and download it as PDF.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    booking_reminder: {
      subjectFr: `🐾 Rappel : votre séjour commence dans 2 jours — Dog Universe`,
      subjectEn: `🐾 Reminder: your stay starts in 2 days — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Petit rappel : votre réservation <strong>${data.bookingRef}</strong> pour <strong>${data.petName}</strong> commence <strong>dans 2 jours</strong>, le <strong>${data.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${data.service}</p>
        <p>Si vous avez des questions ou souhaitez modifier votre réservation, n'hésitez pas à nous contacter.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>Just a reminder: your booking <strong>${data.bookingRef}</strong> for <strong>${data.petName}</strong> starts <strong>in 2 days</strong>, on <strong>${data.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${data.service}</p>
        <p>If you have any questions or would like to modify your booking, please feel free to contact us.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    stay_photo: {
      subjectFr: `📸 Nouvelles photos de ${data.petName} disponibles — Dog Universe`,
      subjectEn: `📸 New photos of ${data.petName} available — Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>De nouvelles photos de <strong>${data.petName}</strong> ont été publiées pour votre réservation <strong>${data.bookingRef}</strong>.</p>
        <p>Connectez-vous à votre espace client pour les consulter !</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>New photos of <strong>${data.petName}</strong> have been posted for your booking <strong>${data.bookingRef}</strong>.</p>
        <p>Log in to your client portal to see them!</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    admin_message: {
      subjectFr: `💬 Message de Dog Universe`,
      subjectEn: `💬 Message from Dog Universe`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${data.message}</p>
        </div>
        ${data.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Réservation : ${data.bookingRef}</p>` : ''}
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${data.message}</p>
        </div>
        ${data.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Booking: ${data.bookingRef}</p>` : ''}
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    welcome: {
      subjectFr: '🐾 Bienvenue chez Dog Universe !',
      subjectEn: '🐾 Welcome to Dog Universe!',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bienvenue ${data.clientName} !</h2>
        <p>Votre compte Dog Universe a bien été créé. Nous sommes ravis de vous accueillir dans notre communauté.</p>
        <p>Vous pouvez dès à présent vous connecter et réserver nos services pour votre compagnon.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.loginUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Accéder à mon espace
          </a>
        </p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Welcome ${data.clientName}!</h2>
        <p>Your Dog Universe account has been created. We are delighted to welcome you to our community.</p>
        <p>You can now log in and book our services for your companion.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.loginUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Go to my account
          </a>
        </p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
    },
    admin_new_client: {
      subjectFr: `🐾 Nouveau client inscrit — ${data.clientName}`,
      subjectEn: `🐾 New client registered — ${data.clientName}`,
      bodyFr: `
        <h2 style="color: #2C2C2C;">Nouveau client inscrit</h2>
        <p>Un nouveau client vient de créer un compte sur Dog Universe.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; color: #6B7280; width: 120px;">Nom</td><td style="padding: 8px; font-weight: bold;">${data.clientName}</td></tr>
          <tr style="background:#F5EDD8;"><td style="padding: 8px; color: #6B7280;">Email</td><td style="padding: 8px;">${data.clientEmail}</td></tr>
          ${data.clientPhone ? `<tr><td style="padding: 8px; color: #6B7280;">Téléphone</td><td style="padding: 8px;">${data.clientPhone}</td></tr>` : ''}
        </table>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.adminUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Voir dans l'administration
          </a>
        </p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">New client registered</h2>
        <p>A new client just created an account on Dog Universe.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; color: #6B7280; width: 120px;">Name</td><td style="padding: 8px; font-weight: bold;">${data.clientName}</td></tr>
          <tr style="background:#F5EDD8;"><td style="padding: 8px; color: #6B7280;">Email</td><td style="padding: 8px;">${data.clientEmail}</td></tr>
          ${data.clientPhone ? `<tr><td style="padding: 8px; color: #6B7280;">Phone</td><td style="padding: 8px;">${data.clientPhone}</td></tr>` : ''}
        </table>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.adminUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View in administration
          </a>
        </p>
      `,
    },
    email_verification: {
      subjectFr: '✉️ Vérifiez votre adresse e-mail — Dog Universe',
      subjectEn: '✉️ Verify your email address — Dog Universe',
      bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${data.clientName},</h2>
        <p>Merci de vous être inscrit sur Dog Universe. Pour activer votre compte, veuillez vérifier votre adresse e-mail.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.verifyUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Vérifier mon adresse e-mail
          </a>
        </p>
        <p style="color: #6B7280; font-size: 13px;">Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez cet e-mail.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${data.clientName},</h2>
        <p>Thank you for registering on Dog Universe. To activate your account, please verify your email address.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.verifyUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Verify my email address
          </a>
        </p>
        <p style="color: #6B7280; font-size: 13px;">This link expires in 24 hours. If you didn't create an account, please ignore this email.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
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
          <a href="${data.resetUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
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
          <a href="${data.resetUrl}" style="background: #C9A84C; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
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
