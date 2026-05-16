// Anniversaires animaux cette semaine — Zone 2.
// Affiché UNIQUEMENT si > 0. Pas d'âge (décision Mehdi : neutre pour les
// vieux animaux). Format : "🎂 Théo (Rim Kabli) — 17 mai".

import type { UpcomingBirthday } from '../_lib/helpers';
import { formatCasaShortDate } from '../_lib/helpers';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  birthdays: UpcomingBirthday[];
  labels: DashboardLabels;
}

export function BirthdaysCard({ locale, birthdays, labels }: Props) {
  if (birthdays.length === 0) return null;
  const fr = locale === 'fr' ? 'fr' : 'en';
  return (
    <div className="bg-gradient-to-br from-[#FBF5E0] to-[#FDF8EC] rounded-xl border border-[#E2C048]/30 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider mb-3">
        {labels.birthdaysTitle}
      </h3>
      <ul className="space-y-1.5">
        {birthdays.map((b) => (
          <li key={b.petId} className="flex items-baseline gap-2 text-sm">
            <span aria-hidden="true">🎂</span>
            <span className="text-charcoal font-medium">{b.petName}</span>
            <span className="text-gray-500">({b.ownerName})</span>
            <span className="text-gray-400">—</span>
            <span className="text-gold-700 font-medium tabular-nums">
              {formatCasaShortDate(b.birthdayYmd, fr)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
