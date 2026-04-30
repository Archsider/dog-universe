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

  const subject = ctx.isFr ? tpl.subjectFr : tpl.subjectEn;
  const body = ctx.isFr ? tpl.bodyFr : tpl.bodyEn;

  return { subject, html: wrapEmailHtml(body) };
}
