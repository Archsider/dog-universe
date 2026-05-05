import {
  buildTemplateContext,
  wrapEmailHtml,
  type EmailPet,
  type EmailTemplateBuilder,
  type EmailTemplateName,
} from './shared';
import { bookingTemplates } from './booking';
import { loyaltyTemplates } from './loyalty';
import { taxiTemplates } from './taxi';
import { authTemplates } from './auth';
import { rgpdTemplates } from './rgpd';
import { stayTemplates } from './stay';
import { billingTemplates } from './billing';

// Re-exports — preserve the public API of `@/lib/email`.
export { sendEmail, escapeHtml } from './shared';
export type { EmailPet, EmailTemplateName } from './shared';

/**
 * Merged registry of every domain-scoped template builder. Domain files own
 * their own subset; this barrel composes them for a single dispatcher.
 */
const allTemplates: Record<string, EmailTemplateBuilder> = {
  ...bookingTemplates,
  ...loyaltyTemplates,
  ...taxiTemplates,
  ...authTemplates,
  ...rgpdTemplates,
  ...stayTemplates,
  ...billingTemplates,
};

/**
 * Render a localized email (subject + HTML) for the given template name.
 *
 * Signature is preserved from the pre-split monolith — callers must not change.
 * `data` values are HTML-escaped (except `resetUrl` / `loginUrl`); `pets` feeds
 * the gender/plural and animal-line helpers exposed via the template context.
 */
export function getEmailTemplate(
  type: EmailTemplateName,
  data: Record<string, string>,
  locale: string = 'fr',
  pets: EmailPet[] = [],
): { subject: string; html: string } {
  const builder = allTemplates[type];
  if (!builder) throw new Error(`Unknown email template: ${type}`);

  const ctx = buildTemplateContext(data, pets, locale);
  const tpl = builder(ctx);

  // AR uses bodyAr/subjectAr when the template provides them, otherwise falls
  // back to EN (sane default for a multi-locale UI that hasn't translated every
  // template yet).
  let subject: string;
  let body: string;
  if (ctx.isAr && tpl.subjectAr && tpl.bodyAr) {
    subject = tpl.subjectAr;
    body = tpl.bodyAr;
  } else {
    subject = ctx.isFr ? tpl.subjectFr : tpl.subjectEn;
    body = ctx.isFr ? tpl.bodyFr : tpl.bodyEn;
  }

  return { subject, html: wrapEmailHtml(body) };
}
