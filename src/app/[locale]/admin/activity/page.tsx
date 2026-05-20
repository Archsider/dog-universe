// /admin/activity — chronological feed of everything that happened.
//
// Reads from the existing ActionLog table : each row already carries
// userId, action, entityType, entityId, details, createdAt.  We render
// today's actions in a vertical timeline grouped by hour, with friendly
// icons + labels per action type.
//
// Source : Wave 6 (Admin classe mondiale, Feature #5).

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCachedAuth } from '@/lib/cached-auth';
import { Activity, CalendarCheck, Wallet, Camera, Star, FileSignature, Truck, ShoppingBag, Edit3, AlertCircle } from 'lucide-react';
import { startOfTodayCasa, endOfTodayCasa, casablancaDateOnly } from '@/lib/dates-casablanca';

type Params = { locale: string };
type SearchParams = { day?: string };

interface ActionEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  user: { name: string; role: string } | null;
}

const ACTION_LABEL: Record<string, { fr: string; en: string; icon: React.ElementType; tint: string }> = {
  BOOKING_CREATED:          { fr: 'Réservation créée', en: 'Booking created', icon: CalendarCheck, tint: 'text-amber-600 bg-amber-50' },
  BOOKING_CONFIRMED:        { fr: 'Réservation confirmée', en: 'Booking confirmed', icon: CalendarCheck, tint: 'text-emerald-600 bg-emerald-50' },
  BOOKING_COMPLETED:        { fr: 'Séjour clôturé', en: 'Stay completed', icon: CalendarCheck, tint: 'text-blue-600 bg-blue-50' },
  BOOKING_CANCELLED:        { fr: 'Réservation annulée', en: 'Booking cancelled', icon: AlertCircle, tint: 'text-red-600 bg-red-50' },
  BOOKING_REJECTED:         { fr: 'Réservation refusée', en: 'Booking rejected', icon: AlertCircle, tint: 'text-red-600 bg-red-50' },
  PAYMENT_RECORDED:         { fr: 'Paiement encaissé', en: 'Payment recorded', icon: Wallet, tint: 'text-emerald-700 bg-emerald-50' },
  INVOICE_CREATED:          { fr: 'Facture créée', en: 'Invoice created', icon: Wallet, tint: 'text-blue-600 bg-blue-50' },
  INVOICE_CREATED_WALKIN:   { fr: 'Walk-in facturé', en: 'Walk-in billed', icon: ShoppingBag, tint: 'text-emerald-700 bg-emerald-50' },
  INVOICE_CANCELLED:        { fr: 'Facture annulée', en: 'Invoice cancelled', icon: AlertCircle, tint: 'text-red-700 bg-red-50' },
  STAY_PHOTO_DELETED:       { fr: 'Photo supprimée', en: 'Photo deleted', icon: Camera, tint: 'text-gray-600 bg-gray-50' },
  PHOTO_UPLOADED:           { fr: 'Photo ajoutée', en: 'Photo uploaded', icon: Camera, tint: 'text-purple-600 bg-purple-50' },
  PRE_STAY_BRIEFING_SUBMITTED: { fr: 'Briefing reçu', en: 'Briefing received', icon: Edit3, tint: 'text-emerald-700 bg-emerald-50' },
  LOYALTY_CLAIM_APPROVED:   { fr: 'Réclamation acceptée', en: 'Claim approved', icon: Star, tint: 'text-yellow-700 bg-yellow-50' },
  LOYALTY_CLAIM_REJECTED:   { fr: 'Réclamation refusée', en: 'Claim rejected', icon: Star, tint: 'text-gray-600 bg-gray-50' },
  CONTRACT_SIGNED:          { fr: 'Contrat signé', en: 'Contract signed', icon: FileSignature, tint: 'text-emerald-700 bg-emerald-50' },
  CONTRACT_DELETED:         { fr: 'Contrat supprimé', en: 'Contract deleted', icon: FileSignature, tint: 'text-red-600 bg-red-50' },
  TAXI_TRIP_STARTED:        { fr: 'Course taxi démarrée', en: 'Taxi started', icon: Truck, tint: 'text-blue-600 bg-blue-50' },
  TAXI_TRIP_COMPLETED:      { fr: 'Course taxi terminée', en: 'Taxi completed', icon: Truck, tint: 'text-emerald-600 bg-emerald-50' },
};

function entryStyle(action: string) {
  return ACTION_LABEL[action] ?? {
    fr: action.replace(/_/g, ' ').toLowerCase(),
    en: action.replace(/_/g, ' ').toLowerCase(),
    icon: Activity,
    tint: 'text-gray-500 bg-gray-50',
  };
}

export default async function AdminActivityPage({
  params, searchParams,
}: { params: Promise<Params>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  const { day } = await searchParams;
  const session = await getCachedAuth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const fr = locale === 'fr';

  // Day filter — defaults to today Casa.  Accepts YYYY-MM-DD format.
  const today = casablancaDateOnly(new Date());
  const targetDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  const isToday = targetDay === today;
  const dayDate = new Date(`${targetDay}T00:00:00Z`);
  const dayStart = isToday ? startOfTodayCasa() : new Date(dayDate.getTime() - 60 * 60_000);
  const dayEnd = isToday ? endOfTodayCasa() : new Date(dayDate.getTime() + 23 * 3600_000);

  const logs = await prisma.actionLog.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
    select: {
      id: true, action: true, entityType: true, entityId: true, createdAt: true,
      user: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const entries: ActionEntry[] = logs.map((l) => ({
    id: l.id, action: l.action, entityType: l.entityType, entityId: l.entityId,
    createdAt: l.createdAt, user: l.user,
  }));

  // Bucket by Casa hour for readability.
  const buckets = new Map<string, ActionEntry[]>();
  for (const e of entries) {
    const casaMs = e.createdAt.getTime() + 60 * 60_000;
    const h = new Date(casaMs).getUTCHours();
    const label = `${String(h).padStart(2, '0')}h`;
    const arr = buckets.get(label) ?? [];
    arr.push(e);
    buckets.set(label, arr);
  }
  const sortedHours = [...buckets.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-6 w-6 text-[#C4974A]" />
            <h1 className="font-serif text-3xl font-bold text-charcoal">
              {fr ? 'Activité' : 'Activity'}
            </h1>
          </div>
          <p className="text-sm text-charcoal/60">
            {isToday
              ? (fr ? `Aujourd'hui · ${entries.length} action${entries.length > 1 ? 's' : ''}` : `Today · ${entries.length} action${entries.length > 1 ? 's' : ''}`)
              : `${targetDay} · ${entries.length}`}
          </p>
        </div>
        {/* Native form GET — server-friendly, no JS handler needed. */}
        <form method="GET" action={`/${locale}/admin/activity`} className="flex items-center gap-2">
          <input
            type="date"
            name="day"
            defaultValue={targetDay}
            className="px-3 py-1.5 rounded-lg border border-ivory-200 text-sm"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-charcoal text-white text-sm font-medium hover:bg-charcoal/90"
          >
            {fr ? 'Voir' : 'View'}
          </button>
        </form>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-ivory-200 bg-white p-12 text-center">
          <p className="text-3xl mb-2">🌙</p>
          <p className="text-charcoal/60">{fr ? 'Aucune activité ce jour-là.' : 'No activity on this day.'}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedHours.map((hLabel) => {
            const items = buckets.get(hLabel)!;
            return (
              <section key={hLabel}>
                <h2 className="text-[10px] uppercase tracking-[3px] font-semibold text-[#C4974A] mb-3 sticky top-32 bg-[#FEFCF9] py-1">
                  {hLabel}
                </h2>
                <ol className="relative space-y-3 border-l-2 border-[#C4974A]/15 pl-5 ml-2">
                  {items.map((it) => {
                    const style = entryStyle(it.action);
                    const Icon = style.icon;
                    const minute = String((it.createdAt.getTime() + 60 * 60_000) / 60_000 % 60 | 0).padStart(2, '0');
                    return (
                      <li key={it.id} className="relative">
                        {/* timeline dot */}
                        <span className="absolute -left-[27px] top-2 w-3 h-3 rounded-full bg-white border-2 border-[#C4974A]" />
                        <div className="rounded-xl border border-ivory-200 bg-white p-3 flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.tint}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-charcoal">
                              {fr ? style.fr : style.en}
                            </p>
                            <p className="text-xs text-charcoal/50 mt-0.5">
                              {it.user?.name ?? (fr ? 'Système' : 'System')}
                              {it.entityType && it.entityId && (
                                <span className="text-charcoal/30"> · {it.entityType} #{it.entityId.slice(0, 8)}</span>
                              )}
                            </p>
                          </div>
                          <span className="text-[10px] text-charcoal/40 tabular-nums shrink-0">
                            :{minute}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
