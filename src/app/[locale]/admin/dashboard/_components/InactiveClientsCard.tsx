// Clients inactifs depuis 6+ mois — Zone 3.
// CTA "Relancer →" par ligne, ouvre wa.me avec un message personnalisé
// au prénom + dernier animal du client.

import Link from 'next/link';
import { Users, MessageCircle } from 'lucide-react';
import type { InactiveClient } from '../_lib/queries';
import { formatCasaShortDate } from '../_lib/helpers';
import { buildInactiveClientMessage, buildWhatsAppUrl, firstNameOf } from '../_lib/whatsapp';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  items: InactiveClient[];
  /** Total count if more than the 3 surfaced — for the "Voir liste complète" link. */
  totalCount?: number;
  labels: DashboardLabels;
}

export function InactiveClientsCard({ locale, items, totalCount, labels }: Props) {
  if (items.length === 0) return null;
  const fr = locale === 'fr' ? 'fr' : 'en';
  const total = totalCount ?? items.length;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center">
          <Users className="h-3.5 w-3.5 text-gray-600" />
        </div>
        <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
          {labels.inactiveTitle}
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">{labels.inactiveSub(total)}</p>
      <ul className="space-y-3">
        {items.map((c) => {
          const firstName = firstNameOf(c.clientName);
          const waUrl = buildWhatsAppUrl(
            c.clientPhone,
            buildInactiveClientMessage({
              clientFirstName: firstName,
              lastPetName: c.lastPetName,
              locale: fr,
            }),
          );
          return (
            <li key={c.clientId} className="border-l-2 border-gray-200 pl-3">
              <Link
                href={`/${locale}/admin/clients/${c.clientId}`}
                className="text-sm font-medium text-charcoal hover:text-[#C4974A]"
              >
                {c.clientName}
              </Link>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatCasaShortDate(c.lastInteractionYmd, fr)}
                <span className="text-gray-400 ml-2">
                  ({labels.daysSinceShort(c.daysSince)})
                </span>
              </p>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                >
                  <MessageCircle className="h-3 w-3" />
                  {labels.reachOut}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {total > items.length && (
        <Link
          href={`/${locale}/admin/clients`}
          className="inline-block mt-3 text-xs text-[#C4974A] hover:text-[#9A7235] font-medium"
        >
          {labels.viewAll}
        </Link>
      )}
    </div>
  );
}
