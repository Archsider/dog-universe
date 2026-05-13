import Link from 'next/link';
import { Star, UserPlus } from 'lucide-react';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  labels: DashboardLabels;
  loyalClients: number;
  newClients: number;
}

/**
 * Row 3 — two client insight cards (loyal clients = >1 booking, new
 * clients = signed up this month). Both link to /admin/clients which
 * has matching filters.
 */
export function ClientInsights({ locale, labels: l, loyalClients, newClients }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 mt-6">
      <Link href={`/${locale}/admin/clients`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Star className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-charcoal">{loyalClients}</div>
            <div className="text-sm text-gray-500">{l.loyalClients}</div>
          </div>
        </div>
      </Link>

      <Link href={`/${locale}/admin/clients`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <UserPlus className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-charcoal">{newClients}</div>
            <div className="text-sm text-gray-500">{l.newClients}</div>
          </div>
        </div>
      </Link>
    </div>
  );
}
