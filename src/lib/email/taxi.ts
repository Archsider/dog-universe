import type { EmailTemplateBuilder } from './shared';

/**
 * Taxi-domain email templates.
 *
 * Currently empty: Pet Taxi outcomes are folded into the booking_completed
 * template (see `bookingTemplates`) which branches on `d.serviceType === 'PET_TAXI'`.
 * This file exists as a stable extension point for future taxi-only emails
 * (e.g. driver-en-route, ETA changes) without re-touching the booking domain.
 */
export const taxiTemplates: Record<string, EmailTemplateBuilder> = {};
