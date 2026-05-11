import { differenceInDays } from 'date-fns';
import { toNumber } from '@/lib/decimal';
import type { TaxiTripData } from '@/components/shared/TaxiTimeline';

interface TaxiTripWithHistory {
  id: string;
  tripType: string;
  status: string;
  date: string | null;
  time: string | null;
  address: string | null;
  history: {
    id: string;
    status: string;
    timestamp: Date;
    updatedBy: string | null;
  }[];
}

export function serializeTrips(taxiTrips: TaxiTripWithHistory[]): TaxiTripData[] {
  return taxiTrips.map(trip => ({
    id: trip.id,
    tripType: trip.tripType,
    status: trip.status,
    date: trip.date,
    time: trip.time,
    address: trip.address,
    history: trip.history.map(h => ({
      id: h.id,
      status: h.status,
      timestamp: h.timestamp.toISOString(),
      updatedBy: h.updatedBy ?? '',
    })),
  }));
}

interface InvoiceItem {
  id: string;
  description: string;
  category: string;
  total: Parameters<typeof toNumber>[0];
}

interface BoardingDetail {
  pricePerNight: Parameters<typeof toNumber>[0];
}

export function computeRunningTotal(params: {
  isBoarding: boolean;
  status: string;
  startDate: Date;
  boardingDetail: BoardingDetail | null;
  invoiceItems: InvoiceItem[] | null;
  now?: Date;
}) {
  const { isBoarding, status, startDate, boardingDetail, invoiceItems, now = new Date() } = params;

  const isStayActive =
    isBoarding &&
    (status === 'IN_PROGRESS' || (status === 'CONFIRMED' && startDate <= now));

  const elapsedNights = isStayActive
    ? Math.max(1, differenceInDays(now, startDate))
    : 0;
  const dailyRate = boardingDetail ? toNumber(boardingDetail.pricePerNight) : 0;
  const elapsedBoardingTotal = elapsedNights * dailyRate;

  const nonBoardingItems = invoiceItems
    ? invoiceItems.filter(it => it.category !== 'BOARDING')
    : [];
  const nonBoardingTotal = nonBoardingItems.reduce((sum, it) => sum + toNumber(it.total), 0);
  const provisionalTotal = elapsedBoardingTotal + nonBoardingTotal;

  return { isStayActive, elapsedNights, elapsedBoardingTotal, nonBoardingItems, provisionalTotal };
}
