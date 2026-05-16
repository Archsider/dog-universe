/* eslint-disable dog-universe/no-getmonth-on-date-casa --
 * OK: client-side UI / calendar grid helpers. These operate either on
 * <input type="date"> values (already local-time) or on (year, month, day)
 * primitives previously extracted via casablancaYMD upstream. The Vercel UTC
 * runtime is not in scope here — the browser is.
 */
'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { formatMonthLabel } from './format-month';

function addMonths(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

interface MonthNavigatorProps {
  locale: string;
  currentMonth: string; // 'YYYY-MM'
}

export function MonthNavigator({ locale, currentMonth }: MonthNavigatorProps) {
  const router = useRouter();
  const isFr = locale === 'fr';

  const now = new Date();
  const nowYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = currentMonth === nowYYYYMM;

  const prev = addMonths(currentMonth, -1);
  const next = addMonths(currentMonth, 1);

  const navigate = (month: string) => {
    router.push(`?month=${month}`);
  };

  // Generate months for the current year and prev year dropdown
  const currentYear = parseInt(currentMonth.split('-')[0]);
  const monthsForDropdown: { value: string; label: string }[] = [];
  // Show previous year + current year months
  for (let yr = currentYear - 1; yr <= currentYear + 1; yr++) {
    for (let m = 1; m <= 12; m++) {
      const val = `${yr}-${String(m).padStart(2, '0')}`;
      monthsForDropdown.push({ value: val, label: formatMonthLabel(val, isFr ? 'fr' : 'en') });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(prev)}
        className="p-2 rounded-lg border border-[rgba(196,151,74,0.3)] text-[#8A7E75] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
        title={isFr ? 'Mois précédent' : 'Previous month'}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <select
        value={currentMonth}
        onChange={e => navigate(e.target.value)}
        className="px-3 py-1.5 bg-white border border-[rgba(196,151,74,0.3)] rounded-lg text-sm font-medium text-[#2A2520] focus:outline-none focus:border-[#C4974A] focus:ring-2 focus:ring-[#C4974A]/15 transition cursor-pointer"
      >
        {monthsForDropdown.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => navigate(next)}
        className="p-2 rounded-lg border border-[rgba(196,151,74,0.3)] text-[#8A7E75] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
        title={isFr ? 'Mois suivant' : 'Next month'}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => navigate(nowYYYYMM)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#C4974A]/40 text-[#C4974A] hover:bg-[#C4974A]/5 transition-colors"
        >
          {isFr ? 'Ce mois' : 'This month'}
        </button>
      )}

      {isCurrentMonth && (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#C4974A]/10 text-[#C4974A] border border-[#C4974A]/25 uppercase tracking-wider">
          {isFr ? 'Actuel' : 'Current'}
        </span>
      )}
    </div>
  );
}

interface CsvButtonProps {
  href: string;
  filename: string;
  locale: string;
}

export function CsvDownloadButton({ href, filename, locale }: CsvButtonProps) {
  return (
    <a
      href={href}
      download={filename}
      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-lg transition-all duration-300"
      title={locale === 'fr' ? 'Exporter en CSV' : 'Export CSV'}
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </a>
  );
}
