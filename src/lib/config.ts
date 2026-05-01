/**
 * Centralized config constants for env vars read in 3+ places.
 * Keeps fallback defaults in one place — no drift across files.
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
