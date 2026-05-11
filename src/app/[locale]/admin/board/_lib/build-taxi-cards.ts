import type { BookingCard, TaxiCard } from './types';
import { TERMINAL_TAXI_STATUSES } from './kanban-config';

// Build unified taxi cards: boarding add-ons (GO + RETURN) + standalone PET_TAXI
export function buildTaxiCards(bookings: BookingCard[]): TaxiCard[] {
  const taxiCards: TaxiCard[] = [];
  for (const b of bookings) {
    if (b.serviceType === 'BOARDING') {
      if (b.taxiGoEnabled) {
        taxiCards.push({ ...b, _cardType: 'GO', _colStatus: b.taxiGoStatus ?? 'PLANNED', _taxiCardKey: `${b.id}-GO` });
      }
      if (b.taxiReturnEnabled) {
        taxiCards.push({ ...b, _cardType: 'RETURN', _colStatus: b.taxiReturnStatus ?? 'PLANNED', _taxiCardKey: `${b.id}-RETURN` });
      }
    } else if (b.serviceType === 'PET_TAXI') {
      taxiCards.push({ ...b, _cardType: null, _colStatus: b.standaloneTripStatus ?? 'PLANNED', _taxiCardKey: b.id });
    }
  }
  return taxiCards;
}

export function countActiveTaxis(taxiCards: TaxiCard[]): number {
  return taxiCards.filter((c) => !TERMINAL_TAXI_STATUSES.has(c._colStatus)).length;
}
