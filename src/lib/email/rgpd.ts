import type { EmailTemplateBuilder } from './shared';

/**
 * RGPD-domain email templates.
 *
 * Currently empty: data-export and anonymization flows return JSON/files
 * directly without transactional emails. This file is the stable extension
 * point for future RGPD-related emails (e.g. data-export-ready notifications).
 */
export const rgpdTemplates: Record<string, EmailTemplateBuilder> = {};
