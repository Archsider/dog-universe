import type { Decimal } from '@prisma/client/runtime/library';

export interface BookingCard {
  id: string;
  version: number;
  serviceType: 'BOARDING' | 'PET_TAXI';
  status: string;
  startDate: string;
  endDate: string | null;
  arrivalTime: string | null;
  totalPrice: number | Decimal;
  clientName: string;
  clientId: string;
  pets: { name: string; species: string; photoUrl: string | null }[];
  taxiType: string | null;
  includeGrooming: boolean;
  taxiGoEnabled: boolean;
  taxiGoStatus: string | null;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnStatus: string | null;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiGoTripId: string | null;
  taxiReturnTripId: string | null;
  standaloneTripId: string | null;
  standaloneTripStatus: string | null;
  taxiGoAddress: string | null;
  taxiReturnAddress: string | null;
  standaloneTripAddress: string | null;
  notes: string | null;
  updatedAt: string;
}

export type TaxiCard = BookingCard & {
  _cardType: 'GO' | 'RETURN' | null;
  _colStatus: string;
  _taxiCardKey: string;
};

export type AllBoardingTaxi = {
  bookingId: string;
  clientName: string;
  pets: string;
  direction: 'GO' | 'RETURN';
  time: string | null;
  date: string;
  bookingStartDate: string;
  bookingEndDate: string | null;
};

export interface Stats {
  activeBoarders: number;
  dogCount: number;
  catCount: number;
  todayArrivals: number;
  todayDepartures: number;
  todayTaxis: number;
  todayArrivalDetails: { id: string; clientName: string; pets: string; arrivalTime: string | null }[];
  todayDepartureDetails: { id: string; clientName: string; pets: string }[];
  allBoardingTaxis: AllBoardingTaxi[];
  upcomingTaxiDetails: { id: string; bookingId: string; clientName: string; pets: string; startDate: string; time: string | null; direction: 'GO' | 'RETURN' | null }[];
  upcomingDepartureDetails: { id: string; clientName: string; pets: string; endDate: string }[];
}

export type TaxiStatusField = 'taxiGoStatus' | 'taxiReturnStatus';
export type TaxiStatusChangeHandler = (id: string, newStatus: string, field?: TaxiStatusField) => void;
