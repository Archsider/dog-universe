import type { EmailTemplateBuilder } from './shared';

/**
 * Auth & onboarding email templates: password reset, welcome, contract reminders,
 * and the admin notification on new client registration.
 */
export const authTemplates: Record<string, EmailTemplateBuilder> = {
  contract_reminder: ({ d }) => ({
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
  }),

  welcome: ({ d }) => ({
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
  }),

  admin_new_client: ({ d }) => ({
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
  }),

  reset_password: ({ d }) => ({
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
  }),
};
