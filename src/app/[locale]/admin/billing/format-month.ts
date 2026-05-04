const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatMonthLabel(yyyyMm: string, locale: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const names = locale === 'fr' ? MONTH_NAMES_FR : MONTH_NAMES_EN;
  return `${names[m - 1]} ${y}`;
}
