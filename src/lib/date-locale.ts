// Locale → Intl date locale tag.
// AR uses Moroccan Arabic (ar-MA) for the calendar — Eastern Arabic
// numerals automatically applied for users with that preference.
// FR uses Moroccan French (fr-MA). Everything else falls back to en-US.
// Centralised here so the booking wizard, pet docs and any future date
// display share the same locale resolution.
export function dateLocaleFor(locale: string): string {
  if (locale === 'ar') return 'ar-MA';
  if (locale === 'fr') return 'fr-MA';
  return 'en-US';
}
