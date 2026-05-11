import { GROOMING_PRICES, TAXI_ADDON_PRICE, type BookingType, type Pet } from './types';
import type { BoardingState, TaxiAddonState, TaxiState } from './use-form-state';

export interface BuildPayloadCtx {
  bookingType: BookingType;
  selectedPets: string[];
  total: number;
  dogPets: Pet[];
  boarding: BoardingState;
  taxiGo: TaxiAddonState;
  taxiReturn: TaxiAddonState;
  taxi: TaxiState;
}

export function buildBookingPayload(ctx: BuildPayloadCtx): Record<string, unknown> {
  const { bookingType, selectedPets, total, dogPets, boarding, taxiGo, taxiReturn, taxi } = ctx;
  const body: Record<string, unknown> = {
    serviceType: bookingType,
    petIds: selectedPets,
    totalPrice: total,
  };

  if (bookingType === 'BOARDING') {
    body.startDate = new Date(boarding.checkIn).toISOString();
    body.endDate = new Date(boarding.checkOut).toISOString();
    body.notes = boarding.notes;
    const groomingDogs = dogPets.filter(d => boarding.groomingPets[d.id]);
    body.includeGrooming = groomingDogs.length > 0;
    // Schéma serveur n'accepte que SMALL | LARGE. Pour 2+ chiens, on prend la
    // taille la plus grande dans la sélection (LARGE si au moins un, sinon SMALL).
    // L'admin peut affiner après réception.
    body.groomingSize = groomingDogs.length === 0
      ? null
      : groomingDogs.some(d => boarding.petSizes[d.id] === 'LARGE') ? 'LARGE' : 'SMALL';
    body.groomingPrice = groomingDogs.reduce(
      (sum, dog) => sum + (boarding.petSizes[dog.id] === 'LARGE' ? GROOMING_PRICES.LARGE : GROOMING_PRICES.SMALL),
      0,
    );
    body.pricePerNight = 0;
    body.taxiGoEnabled = taxiGo.enabled;
    body.taxiGoDate = taxiGo.enabled ? taxiGo.date : null;
    body.taxiGoTime = taxiGo.enabled ? taxiGo.time : null;
    body.taxiGoAddress = taxiGo.enabled ? taxiGo.address : null;
    body.taxiGoLat = taxiGo.enabled ? taxiGo.lat : null;
    body.taxiGoLng = taxiGo.enabled ? taxiGo.lng : null;
    body.taxiReturnEnabled = taxiReturn.enabled;
    body.taxiReturnDate = taxiReturn.enabled ? taxiReturn.date : null;
    body.taxiReturnTime = taxiReturn.enabled ? taxiReturn.time : null;
    body.taxiReturnAddress = taxiReturn.enabled ? taxiReturn.address : null;
    body.taxiReturnLat = taxiReturn.enabled ? taxiReturn.lat : null;
    body.taxiReturnLng = taxiReturn.enabled ? taxiReturn.lng : null;
    body.taxiAddonPrice = (taxiGo.enabled ? TAXI_ADDON_PRICE : 0) + (taxiReturn.enabled ? TAXI_ADDON_PRICE : 0);
  } else {
    body.startDate = taxi.date; // date only — pas de conversion UTC pour éviter le décalage horaire
    body.arrivalTime = taxi.time; // heure brute parsée côté serveur
    body.taxiType = taxi.type;
    body.taxiPickupLat = taxi.pickupLat;
    body.taxiPickupLng = taxi.pickupLng;
    body.taxiPickupAddress = taxi.pickupAddress || null;
    body.taxiDropoffAddress = taxi.dropoffAddress || null;
    const notes = [
      taxi.notes,
      taxi.pickupAddress && `Départ: ${taxi.pickupAddress}`,
      taxi.dropoffAddress && `Arrivée: ${taxi.dropoffAddress}`,
    ].filter(Boolean).join(' | ');
    body.notes = notes || undefined;
  }

  return body;
}
