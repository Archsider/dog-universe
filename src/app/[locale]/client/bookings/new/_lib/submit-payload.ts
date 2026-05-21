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

/**
 * Préfixe l'adresse géocodée par le nom écrit de la résidence/villa (que la
 * sécurité demande au chauffeur). Le nom passe en TÊTE pour être visible
 * dans la nav admin, le SMS chauffeur et la fiche réservation.
 * Format : "Résidence Al Andalous, Villa 12 — Gueliz, Marrakech".
 */
function withPlaceName(placeName: string | undefined, address: string): string | null {
  const name = (placeName ?? '').trim();
  const addr = (address ?? '').trim();
  if (name && addr) return `${name} — ${addr}`;
  if (name) return name;
  return addr || null;
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
    body.taxiGoAddress = taxiGo.enabled ? withPlaceName(taxiGo.placeName, taxiGo.address) : null;
    body.taxiGoLat = taxiGo.enabled ? taxiGo.lat : null;
    body.taxiGoLng = taxiGo.enabled ? taxiGo.lng : null;
    body.taxiReturnEnabled = taxiReturn.enabled;
    body.taxiReturnDate = taxiReturn.enabled ? taxiReturn.date : null;
    body.taxiReturnTime = taxiReturn.enabled ? taxiReturn.time : null;
    body.taxiReturnAddress = taxiReturn.enabled ? withPlaceName(taxiReturn.placeName, taxiReturn.address) : null;
    body.taxiReturnLat = taxiReturn.enabled ? taxiReturn.lat : null;
    body.taxiReturnLng = taxiReturn.enabled ? taxiReturn.lng : null;
    body.taxiAddonPrice = (taxiGo.enabled ? TAXI_ADDON_PRICE : 0) + (taxiReturn.enabled ? TAXI_ADDON_PRICE : 0);
  } else {
    body.startDate = taxi.date; // date only — pas de conversion UTC pour éviter le décalage horaire
    body.arrivalTime = taxi.time; // heure brute parsée côté serveur
    body.taxiType = taxi.type;
    body.taxiPickupLat = taxi.pickupLat;
    body.taxiPickupLng = taxi.pickupLng;
    const pickupFull = withPlaceName(taxi.pickupPlaceName, taxi.pickupAddress);
    body.taxiPickupAddress = pickupFull;
    body.taxiDropoffAddress = taxi.dropoffAddress || null;
    const notes = [
      taxi.notes,
      pickupFull && `Départ: ${pickupFull}`,
      taxi.dropoffAddress && `Arrivée: ${taxi.dropoffAddress}`,
    ].filter(Boolean).join(' | ');
    body.notes = notes || undefined;
  }

  return body;
}
