'use client';

// Client orchestrator for the Today view.
// Holds the CloseStayDialog modal state + handles inline mutations
// (check-in, validate, reject) with optimistic-ish UX (router.refresh on success).
//
// Sections are rendered here as plain JSX so we can share modal state across
// all of them without prop drilling through 5 server components.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn, LogOut, Clock, CheckCircle2, XCircle, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatMAD } from '@/lib/utils';
import { daysUntilCasablanca } from '@/lib/dates-casablanca';
import CloseStayDialog from './CloseStayDialog';
import type { TodayBooking, TodaySnapshot } from '../_lib/today-queries';

type Pricing = React.ComponentProps<typeof CloseStayDialog>['pricing'];

type Props = {
  snapshot: TodaySnapshot;
  pricing: Pricing;
  locale: string;
};

export default function TodayClient({ snapshot, pricing, locale }: Props) {
  const fr = locale !== 'en';
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closeFor, setCloseFor] = useState<TodayBooking | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showAllPresent, setShowAllPresent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: fr ? 'Erreur' : 'Error',
          description: (data as { error?: string }).error ?? (fr ? 'Échec' : 'Failed'),
          variant: 'destructive',
        });
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function checkIn(b: TodayBooking) {
    const ok = await patch(b.id, { status: 'IN_PROGRESS', version: b.version });
    if (ok) toast({ title: fr ? 'Check-in effectué' : 'Checked in', variant: 'success' });
  }

  async function validate(b: TodayBooking) {
    const ok = await patch(b.id, { status: 'CONFIRMED', version: b.version });
    if (ok) toast({ title: fr ? 'Réservation validée' : 'Booking validated', variant: 'success' });
  }

  async function reject(b: TodayBooking) {
    if (rejectReason.trim().length < 10) {
      toast({
        title: fr ? 'Raison requise' : 'Reason required',
        description: fr ? 'Minimum 10 caractères' : 'At least 10 characters',
        variant: 'destructive',
      });
      return;
    }
    const ok = await patch(b.id, {
      status: 'REJECTED',
      version: b.version,
      cancellationReason: rejectReason.trim(),
    });
    if (ok) {
      toast({ title: fr ? 'Réservation refusée' : 'Booking rejected', variant: 'success' });
      setRejectingId(null);
      setRejectReason('');
    }
  }

  const presentVisible = showAllPresent ? snapshot.currentStays : snapshot.currentStays.slice(0, 5);

  return (
    <>
      {/* KPI row */}
      <KpiRow snapshot={snapshot} locale={locale} />

      {/* Arrivals */}
      <Section
        id="arrivals"
        icon={<LogIn className="h-4 w-4 text-blue-600" />}
        title={fr ? 'Arrivées aujourd\'hui' : 'Arrivals today'}
        count={snapshot.arrivals.length}
        accent="blue"
      >
        {snapshot.arrivals.length === 0 ? (
          <Empty message={fr ? 'Aucune arrivée prévue' : 'No arrivals scheduled'} />
        ) : (
          <ul className="divide-y divide-ivory-100">
            {snapshot.arrivals.map((b) => (
              <li key={b.id} className="py-3 grid grid-cols-[60px_1fr_auto] gap-3 items-center">
                <span className="text-sm font-mono text-blue-700">{b.arrivalTime ?? '—'}</span>
                <div className="min-w-0">
                  <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
                    <p className="text-sm font-medium text-charcoal truncate hover:underline">
                      {b.client.name}
                      {b.client.isWalkIn && (
                        <span className="ml-2 text-[10px] uppercase bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">walk-in</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {b.pets.map((p) => p.name).join(', ')} · {nightsLabel(b, fr)}
                    </p>
                    {b.client.phone && <p className="text-xs text-gray-400">{b.client.phone}</p>}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => checkIn(b)}
                  disabled={busyId === b.id || pending}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {fr ? 'Check-in' : 'Check in'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Departures */}
      <Section
        id="departures"
        icon={<LogOut className="h-4 w-4 text-amber-600" />}
        title={fr ? 'Départs aujourd\'hui' : 'Departures today'}
        count={snapshot.departures.length}
        accent="amber"
      >
        {snapshot.departures.length === 0 ? (
          <Empty message={fr ? 'Aucun départ prévu' : 'No departures scheduled'} />
        ) : (
          <ul className="divide-y divide-ivory-100">
            {snapshot.departures.map((b) => (
              <li key={b.id} className="py-3 grid grid-cols-[60px_1fr_auto_auto] gap-3 items-center">
                <span className="text-sm font-mono text-amber-700">
                  {b.endDate ? new Date(b.endDate).toLocaleTimeString(fr ? 'fr-MA' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
                <Link href={`/${locale}/admin/reservations/${b.id}`} className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate hover:underline">{b.client.name}</p>
                  <p className="text-xs text-gray-500 truncate">{b.pets.map((p) => p.name).join(', ')}</p>
                </Link>
                <div className="text-right text-xs">
                  <p className="text-gray-500">{nightsLabel(b, fr)}</p>
                  <p className="font-medium text-charcoal">{formatMAD(b.liveTotal ?? b.invoiceAmount ?? b.totalPrice)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCloseFor(b)}
                  className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
                >
                  {fr ? 'Clôturer' : 'Close'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Current stays */}
      <Section
        id="present"
        icon={<Clock className="h-4 w-4 text-gray-600" />}
        title={fr ? 'Dans la pension' : 'Currently boarding'}
        count={snapshot.currentStays.length}
        accent="gray"
      >
        {snapshot.currentStays.length === 0 ? (
          <Empty message={fr ? 'Aucun animal présent' : 'No animals on site'} />
        ) : (
          <>
            <ul className="divide-y divide-ivory-100">
              {presentVisible.map((b) => (
                <li key={b.id} className="py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <Link href={`/${locale}/admin/reservations/${b.id}`} className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate hover:underline">
                      {b.client.name}
                      {b.client.isWalkIn && (
                        <span className="ml-2 text-[10px] uppercase bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">walk-in</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{b.pets.map((p) => p.name).join(', ')}</p>
                  </Link>
                  <DepartureBadge b={b} fr={fr} />
                </li>
              ))}
            </ul>
            {snapshot.currentStays.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllPresent((s) => !s)}
                className="mt-2 text-xs text-gold-600 hover:underline"
              >
                {showAllPresent
                  ? fr ? 'Réduire' : 'Show less'
                  : fr ? `Voir les ${snapshot.currentStays.length - 5} autres` : `See ${snapshot.currentStays.length - 5} more`}
              </button>
            )}
          </>
        )}
      </Section>

      {/* Pending */}
      <Section
        id="pending"
        icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
        title={fr ? 'En attente de validation' : 'Pending validation'}
        count={snapshot.pending.length}
        accent="amber"
      >
        {snapshot.pending.length === 0 ? (
          <Empty message={fr ? 'File vide' : 'Queue empty'} />
        ) : (
          <ul className="divide-y divide-ivory-100">
            {snapshot.pending.map((b) => (
              <li key={b.id} className="py-3 space-y-2">
                {/* Mobile : text + actions stack vertically (actions full-width row).
                    Desktop ≥ sm : 3-col grid as before.  Stops the green
                    Valider button from getting clipped off the right edge
                    on 360 px viewports. */}
                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <Link href={`/${locale}/admin/reservations/${b.id}`} className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate hover:underline">{b.client.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {b.pets.map((p) => p.name).join(', ')} · {new Date(b.startDate).toLocaleDateString(fr ? 'fr-MA' : 'en-GB')}
                      {b.endDate ? ` → ${new Date(b.endDate).toLocaleDateString(fr ? 'fr-MA' : 'en-GB')}` : ''}
                    </p>
                  </Link>
                  <div className="flex gap-2 sm:contents">
                    <button
                      type="button"
                      onClick={() => setRejectingId(b.id)}
                      disabled={busyId === b.id || pending}
                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-md border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <XCircle className="h-3 w-3" />{fr ? 'Refuser' : 'Reject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => validate(b)}
                      disabled={busyId === b.id || pending}
                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />{fr ? 'Valider' : 'Validate'}
                    </button>
                  </div>
                </div>
                {rejectingId === b.id && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-2 space-y-2">
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={fr ? 'Raison du refus (min. 10 caractères)' : 'Rejection reason (min. 10 chars)'}
                      className="w-full text-sm border border-red-200 rounded-md px-2 py-1.5 bg-white"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        className="px-3 py-1 rounded-md border border-ivory-200 text-xs"
                      >
                        {fr ? 'Annuler' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => reject(b)}
                        disabled={busyId === b.id}
                        className="px-3 py-1 rounded-md bg-red-600 text-white text-xs disabled:opacity-50"
                      >
                        {fr ? 'Confirmer le refus' : 'Confirm rejection'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Upcoming week */}
      {snapshot.upcomingWeek.length > 0 && (
        <Section
          id="upcoming-week"
          icon={<Calendar className="h-4 w-4 text-gray-500" />}
          title={fr ? 'À venir cette semaine' : 'Upcoming this week'}
          count={snapshot.upcomingWeek.reduce((s, d) => s + d.count, 0)}
          accent="gray"
        >
          <Link
            href={`/${locale}/admin/reservations?view=upcoming`}
            className="block text-sm text-gray-700 hover:text-charcoal"
          >
            {snapshot.upcomingWeek
              .map((d) => `${new Date(d.date).toLocaleDateString(fr ? 'fr-MA' : 'en-GB', { weekday: 'short', day: '2-digit' })} · ${d.count}`)
              .join(' · ')}
          </Link>
        </Section>
      )}

      {/* Close-stay modal */}
      {closeFor && (
        <CloseStayDialog
          open={!!closeFor}
          onClose={() => setCloseFor(null)}
          booking={{
            id: closeFor.id,
            clientName: closeFor.client.name,
            pets: closeFor.pets,
            startDate: closeFor.startDate,
            endDate: closeFor.endDate,
            isOpenEnded: closeFor.isOpenEnded,
            totalPrice: closeFor.totalPrice,
            invoiceAmount: closeFor.invoiceAmount,
          }}
          pricing={pricing}
          locale={locale}
        />
      )}
    </>
  );
}

function KpiRow({ snapshot, locale }: { snapshot: TodaySnapshot; locale: string }) {
  const fr = locale !== 'en';
  const items: { id: string; label: string; value: number; tone: 'blue' | 'amber' | 'gray' | 'amber-warn' }[] = [
    { id: 'arrivals', label: fr ? 'Arrivées' : 'Arrivals', value: snapshot.kpis.arrivals, tone: 'blue' },
    { id: 'departures', label: fr ? 'Départs' : 'Departures', value: snapshot.kpis.departures, tone: 'amber' },
    { id: 'present', label: fr ? 'Présents' : 'Present', value: snapshot.kpis.present, tone: 'gray' },
    { id: 'pending', label: fr ? 'À valider' : 'To validate', value: snapshot.kpis.pending, tone: snapshot.kpis.pending > 0 ? 'amber-warn' : 'gray' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {items.map((kpi) => (
        <button
          key={kpi.id}
          type="button"
          onClick={() => {
            const el = document.getElementById(kpi.id === 'present' ? 'present' : kpi.id);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('ring-2', 'ring-gold-400');
            setTimeout(() => el.classList.remove('ring-2', 'ring-gold-400'), 2000);
          }}
          className={[
            'rounded-xl border p-4 text-left transition-colors',
            kpi.tone === 'blue' && 'border-blue-200 bg-blue-50 hover:bg-blue-100',
            kpi.tone === 'amber' && 'border-amber-200 bg-amber-50 hover:bg-amber-100',
            kpi.tone === 'amber-warn' && 'border-amber-300 bg-amber-100 hover:bg-amber-200',
            kpi.tone === 'gray' && 'border-ivory-200 bg-white hover:bg-ivory-50',
          ].filter(Boolean).join(' ')}
        >
          <p className="text-2xl font-semibold text-charcoal">{kpi.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
        </button>
      ))}
    </div>
  );
}

function Section({
  id, icon, title, count, accent, children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  accent: 'blue' | 'amber' | 'gray';
  children: React.ReactNode;
}) {
  const border =
    accent === 'blue' ? 'border-blue-100'
    : accent === 'amber' ? 'border-amber-100'
    : 'border-ivory-200';
  return (
    <section
      id={id}
      className={`bg-white rounded-xl border ${border} p-5 mb-4 shadow-card scroll-mt-20 transition-shadow`}
    >
      <header className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        <span className="text-xs text-gray-400">({count})</span>
      </header>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-gray-400 py-2">{message}</p>;
}

function nightsLabel(b: TodayBooking, fr: boolean): string {
  if (b.isOpenEnded && b.liveNights != null) {
    return fr ? `Walk-in · J+${b.liveNights}` : `Walk-in · D+${b.liveNights}`;
  }
  if (!b.endDate) return fr ? 'Sans date de fin' : 'Open-ended';
  const n = Math.max(1, Math.round((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86_400_000));
  return fr ? `${n} nuit${n > 1 ? 's' : ''}` : `${n} night${n > 1 ? 's' : ''}`;
}

function DepartureBadge({ b, fr }: { b: TodayBooking; fr: boolean }) {
  if (!b.endDate) {
    return (
      <span className="text-[10px] uppercase bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">
        {fr ? `Walk-in · J+${b.liveNights ?? '?'}` : `Walk-in · D+${b.liveNights ?? '?'}`}
      </span>
    );
  }
  // Calendar-day diff anchored on Casablanca (UTC+1 fixed). The previous
  // `Math.round((endMs - nowMs) / 86_400_000)` measured wall-clock instants:
  // a departure stored at 16-May 00:00 Casa (= 15-May 23:00 UTC) read from
  // a 14-May afternoon timestamp returned 1, flagging "Départ demain" for
  // a stay still 2 calendar days away. casa-tz date-only math is the fix.
  const diff = daysUntilCasablanca(b.endDate);
  if (diff <= 0) {
    return (
      <span className="text-[10px] uppercase bg-red-200 text-red-800 rounded px-1.5 py-0.5">
        {fr ? "Départ aujourd'hui" : 'Leaves today'}
      </span>
    );
  }
  if (diff === 1) {
    return (
      <span className="text-[10px] uppercase bg-red-100 text-red-700 rounded px-1.5 py-0.5">
        {fr ? 'Départ demain' : 'Leaves tomorrow'}
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
      {fr ? `Dans ${diff} j` : `In ${diff} d`}
    </span>
  );
}
