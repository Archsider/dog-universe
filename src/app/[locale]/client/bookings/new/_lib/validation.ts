/* eslint-disable dog-universe/no-getmonth-on-date-casa --
 * OK: client-side UI / calendar grid helpers. These operate either on
 * <input type="date"> values (already local-time) or on (year, month, day)
 * primitives previously extracted via casablancaYMD upstream. The Vercel UTC
 * runtime is not in scope here — the browser is.
 */
export const isValidTaxiDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() !== 0; // 0 = dimanche
};

export const isValidTaxiTime = (timeStr: string): boolean => {
  if (!timeStr) return true;
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinutes = h * 60 + (m || 0);
  return totalMinutes >= 10 * 60 && totalMinutes <= 17 * 60;
};
