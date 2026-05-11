'use client';

import { useState } from 'react';
import type { BookingCard, Stats, TaxiStatusField } from './_lib/types';
import { categorize } from './_lib/categorize';
import { normDateTs } from './_lib/format';
import { buildTaxiCards, countActiveTaxis } from './_lib/build-taxi-cards';
import { StatsCards } from './_components/StatsCards';
import { UpcomingDepartures, UpcomingTaxis, TodayBoardingTaxis } from './_components/UpcomingSections';
import { BoardTabs } from './_components/BoardTabs';
import { BoardingKanban } from './_components/BoardingKanban';
import { TaxiKanban } from './_components/TaxiKanban';

interface Props {
  locale: string;
  bookings: BookingCard[];
  stats: Stats;
}

export default function BoardView({ locale, bookings: initialBookings, stats }: Props) {
  const [tab, setTab] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [bookings, setBookings] = useState<BookingCard[]>(initialBookings);
  const isFr = locale === 'fr';

  const { pending, confirmed, inProgress, completed } = categorize(bookings, 'BOARDING');

  // Optimistic update for taxi status changes
  const handleTaxiStatusChange = (id: string, newStatus: string, field?: TaxiStatusField) => {
    setBookings(prev => prev.map(b => {
      if (b.id !== id) return b;
      if (field === 'taxiGoStatus') return { ...b, taxiGoStatus: newStatus };
      if (field === 'taxiReturnStatus') return { ...b, taxiReturnStatus: newStatus };
      return { ...b, status: newStatus };
    }));
  };

  const taxiCards = buildTaxiCards(bookings);
  const taxiTabCount = countActiveTaxis(taxiCards);
  const allerCards = taxiCards.filter((c) => c._cardType === 'GO' || c._cardType === null);
  const retourCards = taxiCards.filter((c) => c._cardType === 'RETURN');

  // Compute today bucket for boarding taxi add-on sections
  const todayTs = new Date();
  todayTs.setHours(0, 0, 0, 0);

  const sortByTimeAsc = (a: { time: string | null }, b: { time: string | null }) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return a.time ? -1 : b.time ? 1 : 0;
  };

  const todayBoardingTaxisList = stats.allBoardingTaxis
    .filter((t) => normDateTs(t.date) === todayTs.getTime())
    .sort(sortByTimeAsc);

  const l = {
    title: isFr ? 'Tableau opérationnel' : 'Operations Board',
    subtitle: isFr ? 'Vue en temps réel des séjours et trajets' : 'Real-time view of stays and rides',
    activeBoarders: isFr ? 'Pensionnaires actifs' : 'Active boarders',
    arrivals: isFr ? "Arrivées aujourd'hui" : "Today's arrivals",
    departures: isFr ? "Départs aujourd'hui" : "Today's departures",
    taxis: isFr ? "Taxis aujourd'hui" : "Today's taxis",
    pension: isFr ? 'Pension' : 'Boarding',
    petTaxi: 'Pet Taxi',
    at: isFr ? 'à' : 'at',
    taxiSoon: isFr ? 'À venir — 7 prochains jours' : 'Upcoming — next 7 days',
  };

  const pensionTabCount = bookings.filter((b) => b.serviceType === 'BOARDING' && b.status !== 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-charcoal/50 mt-1">{l.subtitle}</p>
      </div>

      {/* En ce moment — stats */}
      <StatsCards
        stats={stats}
        todayBoardingTaxisList={todayBoardingTaxisList}
        labels={{
          activeBoarders: l.activeBoarders,
          arrivals: l.arrivals,
          departures: l.departures,
          taxis: l.taxis,
          at: l.at,
        }}
      />

      {/* Départs à venir — boardings ending in the next 7 days */}
      <UpcomingDepartures stats={stats} locale={locale} isFr={isFr} />

      {/* Pet Taxi à venir — standalone taxis + boarding taxi add-ons in the next 7 days */}
      <UpcomingTaxis stats={stats} locale={locale} isFr={isFr} taxiSoonLabel={l.taxiSoon} />

      {/* Pet Taxi du jour — taxi add-ons happening today */}
      <TodayBoardingTaxis todayBoardingTaxisList={todayBoardingTaxisList} isFr={isFr} />

      {/* Tabs */}
      <BoardTabs
        tab={tab}
        setTab={setTab}
        pensionCount={pensionTabCount}
        taxiCount={taxiTabCount}
        pensionLabel={l.pension}
        taxiLabel={l.petTaxi}
      />

      {/* BOARDING Kanban */}
      {tab === 'BOARDING' && (
        <BoardingKanban
          pending={pending}
          confirmed={confirmed}
          inProgress={inProgress}
          completed={completed}
          locale={locale}
        />
      )}

      {/* PET TAXI — Aller + Retour */}
      {tab === 'PET_TAXI' && (
        <TaxiKanban
          allerCards={allerCards}
          retourCards={retourCards}
          locale={locale}
          isFr={isFr}
          onStatusChange={handleTaxiStatusChange}
        />
      )}
    </div>
  );
}
