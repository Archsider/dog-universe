// /admin/inbox — unified actionable backlog.
//
// Aggregates everything that needs the admin's attention :
//   - PENDING bookings (validation)
//   - PENDING loyalty claims
//   - Addon requests
//   - Pre-stay briefings just submitted
//   - Reschedule requests
//   - Unsigned client contracts
//
// Each row deep-links to its native screen.  The point is to never have
// to remember "where do I check for X" — it's all here.
//
// Source : Wave 6 (Admin classe mondiale, Feature #4).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { getCachedAuth } from '@/lib/cached-auth';
import { Inbox, CalendarClock, Star, ShoppingBag, FileSignature, ClipboardList, RefreshCw } from 'lucide-react';

type Params = { locale: string };

interface InboxItem {
  id: string;
  type: 'booking_pending' | 'claim_pending' | 'addon' | 'briefing' | 'contract_missing' | 'reschedule';
  title: string;
  subtitle: string;
  createdAt: Date;
  href: string;
}

const TYPE_STYLE: Record<InboxItem['type'], { icon: React.ElementType; accent: string; label: { fr: string; en: string } }> = {
  booking_pending:   { icon: CalendarClock, accent: 'text-amber-600 bg-amber-50',  label: { fr: 'Réservation à valider', en: 'Booking to validate' } },
  claim_pending:     { icon: Star,          accent: 'text-yellow-700 bg-yellow-50', label: { fr: 'Réclamation fidélité', en: 'Loyalty claim' } },
  addon:             { icon: ShoppingBag,   accent: 'text-blue-700 bg-blue-50',   label: { fr: 'Demande d\'addon', en: 'Addon request' } },
  briefing:          { icon: ClipboardList, accent: 'text-emerald-700 bg-emerald-50', label: { fr: 'Briefing reçu', en: 'Briefing received' } },
  contract_missing:  { icon: FileSignature, accent: 'text-red-700 bg-red-50',     label: { fr: 'Contrat manquant', en: 'Contract missing' } },
  reschedule:        { icon: RefreshCw,     accent: 'text-orange-700 bg-orange-50', label: { fr: 'Demande de report', en: 'Reschedule request' } },
};

export default async function AdminInboxPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await getCachedAuth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const fr = locale === 'fr';

  // Pull everything in parallel — each capped at 50.
  const [pendingBookings, pendingClaims, addons, briefings, missingContracts, rescheduleRequests] = await Promise.all([
    prisma.booking.findMany({
      where: notDeleted({ status: 'PENDING' }),
      select: {
        id: true, startDate: true, serviceType: true, createdAt: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } }, take: 2 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.loyaltyBenefitClaim.findMany({
      where: { status: 'PENDING' },
      select: { id: true, claimedAt: true, benefitKey: true, client: { select: { id: true, name: true } } },
      orderBy: { claimedAt: 'desc' },
      take: 50,
    }),
    prisma.addonRequest.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true, serviceType: true, description: true, createdAt: true,
        bookingId: true,
        booking: { select: { client: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.preStayBriefing.findMany({
      where: { submittedAt: { not: null } },
      select: {
        bookingId: true, submittedAt: true,
        booking: {
          select: {
            id: true, status: true, startDate: true,
            client: { select: { name: true } },
            bookingPets: { select: { pet: { select: { name: true } } }, take: 1 },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
    prisma.user.findMany({
      where: notDeleted({
        role: 'CLIENT',
        isWalkIn: false,
        contract: null,
      }),
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.booking.findMany({
      where: notDeleted({
        status: 'PENDING',
        notes: { contains: '[RESCHEDULE_REQUEST]' },
      }),
      select: {
        id: true, startDate: true, createdAt: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const items: InboxItem[] = [];

  for (const b of pendingBookings) {
    const petNames = b.bookingPets.map((bp) => bp.pet?.name).filter(Boolean).join(', ');
    const dateStr = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short' }).format(b.startDate);
    items.push({
      id: `booking:${b.id}`,
      type: 'booking_pending',
      title: `${b.client?.name ?? '—'} · ${petNames || '—'}`,
      subtitle: `${b.serviceType} · ${dateStr}`,
      createdAt: b.createdAt,
      href: `/${locale}/admin/reservations/${b.id}`,
    });
  }

  for (const c of pendingClaims) {
    items.push({
      id: `claim:${c.id}`,
      type: 'claim_pending',
      title: c.client?.name ?? '—',
      subtitle: c.benefitKey,
      createdAt: c.claimedAt,
      href: `/${locale}/admin/loyalty`,
    });
  }

  for (const a of addons) {
    items.push({
      id: `addon:${a.id}`,
      type: 'addon',
      title: a.booking?.client?.name ?? '—',
      subtitle: `${a.serviceType}${a.description ? ` · ${a.description.slice(0, 60)}` : ''}`,
      createdAt: a.createdAt,
      href: `/${locale}/admin/reservations/${a.bookingId}`,
    });
  }

  for (const b of briefings) {
    if (!b.booking) continue;
    const petName = b.booking.bookingPets[0]?.pet?.name ?? '—';
    items.push({
      id: `briefing:${b.bookingId}`,
      type: 'briefing',
      title: `${b.booking.client?.name ?? '—'} · ${petName}`,
      subtitle: fr ? 'Briefing pré-séjour complété' : 'Pre-stay briefing completed',
      createdAt: b.submittedAt ?? new Date(0),
      href: `/${locale}/admin/reservations/${b.booking.id}`,
    });
  }

  for (const u of missingContracts) {
    items.push({
      id: `contract:${u.id}`,
      type: 'contract_missing',
      title: u.name,
      subtitle: fr ? 'Pas encore signé le contrat client' : 'Client contract not yet signed',
      createdAt: u.createdAt,
      href: `/${locale}/admin/clients/${u.id}`,
    });
  }

  for (const r of rescheduleRequests) {
    const petName = r.bookingPets[0]?.pet?.name ?? '—';
    items.push({
      id: `reschedule:${r.id}`,
      type: 'reschedule',
      title: `${r.client?.name ?? '—'} · ${petName}`,
      subtitle: fr ? 'Souhaite reporter sa réservation' : 'Wants to reschedule',
      createdAt: r.createdAt,
      href: `/${locale}/admin/reservations/${r.id}`,
    });
  }

  // Sort oldest first — items waiting the longest are most urgent.
  items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const total = items.length;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Inbox className="h-7 w-7 text-[#C4974A]" />
        <div>
          <h1 className="font-serif text-3xl font-bold text-charcoal">
            {fr ? 'Boîte de réception' : 'Inbox'}
          </h1>
          <p className="text-sm text-charcoal/60 mt-1">
            {total === 0
              ? (fr ? 'Tout est traité ✨' : 'All caught up ✨')
              : (fr ? `${total} action${total > 1 ? 's' : ''} en attente` : `${total} pending action${total > 1 ? 's' : ''}`)}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <p className="text-3xl mb-2">🌿</p>
          <p className="text-emerald-900 font-semibold">
            {fr ? 'Aucune tâche en attente' : 'No pending tasks'}
          </p>
          <p className="text-emerald-800/70 text-sm mt-1">
            {fr ? 'Profitez du moment.' : 'Enjoy the moment.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const style = TYPE_STYLE[it.type];
            const Icon = style.icon;
            const ageMin = Math.floor((Date.now() - it.createdAt.getTime()) / 60_000);
            const ageStr = ageMin < 60
              ? (fr ? `il y a ${ageMin} min` : `${ageMin}m ago`)
              : ageMin < 1440
                ? (fr ? `il y a ${Math.floor(ageMin / 60)}h` : `${Math.floor(ageMin / 60)}h ago`)
                : (fr ? `il y a ${Math.floor(ageMin / 1440)}j` : `${Math.floor(ageMin / 1440)}d ago`);
            return (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-center gap-3 rounded-xl border border-ivory-200 bg-white p-4 hover:border-[#C4974A]/50 hover:shadow-md transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.accent}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-charcoal truncate">{it.title}</p>
                    <p className="text-xs text-charcoal/50 truncate">{it.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-charcoal/40">
                      {fr ? style.label.fr : style.label.en}
                    </span>
                    <span className="text-[10px] text-charcoal/40">{ageStr}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
