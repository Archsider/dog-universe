import Link from 'next/link';
import { Calendar, Clock, TrendingUp, Users } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  labels: DashboardLabels;
  thisAmt: number;
  delta: number;
  variationColor: string;
  currentCatBoarders: number;
  currentDogBoarders: number;
  capacityCat: number;
  capacityDog: number;
  pendingBookings: number;
  totalClients: number;
}

/**
 * Row 1 — four primary KPI cards: monthly revenue, current boarders
 * (with capacity bars per species), pending bookings, total clients.
 *
 * Each card is a Link to the filtered admin page so the operator can
 * drill down with one click.
 */
export function MainKpis({
  locale,
  labels: l,
  thisAmt,
  delta,
  variationColor,
  currentCatBoarders,
  currentDogBoarders,
  capacityCat,
  capacityDog,
  pendingBookings,
  totalClients,
}: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {/* Cash collected */}
      <Link href={`/${locale}/admin/billing`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3">
            <TrendingUp className="h-5 w-5 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-charcoal">{formatMAD(thisAmt)}</div>
          <div className="text-xs text-gray-500 mt-0.5">{l.caMonthly}</div>
          <div className={`text-xs mt-1 font-medium ${variationColor}`}>
            {`${delta > 0 ? '+' : ''}${delta}% vs mois préc.`}
          </div>
        </div>
      </Link>

      {/* Current boarders — split per species with capacity bars */}
      <Link href={`/${locale}/admin/reservations`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center mb-3">
            <Calendar className="h-5 w-5 text-gold-500" />
          </div>
          <div className="text-xs text-gray-500 mb-2">{l.animauxHeberges}</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">🐱 {l.cats}</span>
              <span className="text-sm font-bold text-charcoal">
                {currentCatBoarders}
                <span className="text-xs font-normal text-gray-400"> / {capacityCat}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div
                className="h-1.5 bg-gold-400 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (currentCatBoarders / capacityCat) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-500">🐕 {l.dogs}</span>
              <span className="text-sm font-bold text-charcoal">
                {currentDogBoarders}
                <span className="text-xs font-normal text-gray-400"> / {capacityDog}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div
                className="h-1.5 bg-charcoal rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (currentDogBoarders / capacityDog) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Link>

      {/* Pending bookings */}
      <Link href={`/${locale}/admin/reservations?status=PENDING`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-charcoal">{pendingBookings}</div>
          <div className="text-xs text-gray-500 mt-0.5">{l.pending}</div>
        </div>
      </Link>

      {/* Total clients */}
      <Link href={`/${locale}/admin/clients`}>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-charcoal">{totalClients}</div>
          <div className="text-xs text-gray-500 mt-0.5">{l.totalClients}</div>
        </div>
      </Link>
    </div>
  );
}
