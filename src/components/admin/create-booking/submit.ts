import { logger } from '@/lib/logger';
import { createClientBooking, createInvoice } from '@/lib/api-client';
import type { ClientBookingCreateBody } from '@/lib/api-schemas/client-booking';
import type { CreateInvoiceBody } from '@/lib/api-schemas/invoice';
import type { CustomLine, WalkInPet } from './lib';
import type { GroomingSize, TaxiType } from '@/lib/pricing-client';

export interface SubmitArgs {
  fr: boolean;
  isWalkIn: boolean;
  clientId: string;
  selectedPetIds: string[];
  walkInName: string;
  walkInPhone: string;
  walkInPets: WalkInPet[];
  serviceType: 'BOARDING' | 'PET_TAXI';
  startDate: string;
  endDate: string;
  taxiDate: string;
  taxiTime: string;
  taxiType: TaxiType;
  notes: string;
  finalTotal: number;
  // boarding addons
  groomingEnabled: boolean;
  groomingSize: GroomingSize;
  groomingTotal: number;
  taxiGoEnabled: boolean;
  taxiGoDate: string;
  taxiGoTime: string;
  taxiGoAddress: string;
  taxiReturnEnabled: boolean;
  taxiReturnDate: string;
  taxiReturnTime: string;
  taxiReturnAddress: string;
  taxiAddonTotal: number;
  // dogs (filtered already)
  dogsCount: number;
  validCustomLines: CustomLine[];
}

export interface SubmitResult {
  invoiceCreated: boolean;
}

/**
 * Performs the create-booking submit flow:
 *   1. (walk-in only) create User + pets
 *   2. POST /api/bookings
 *   3. (walk-in only) auto-create invoice (best-effort)
 * Throws Error with `.message` containing the API error code on failure.
 */
export async function submitAdminBooking(args: SubmitArgs): Promise<SubmitResult> {
  const {
    fr, isWalkIn, clientId, selectedPetIds,
    walkInName, walkInPhone, walkInPets,
    serviceType, startDate, endDate, taxiDate, taxiTime, taxiType,
    notes, finalTotal,
    groomingEnabled, groomingSize, groomingTotal,
    taxiGoEnabled, taxiGoDate, taxiGoTime, taxiGoAddress,
    taxiReturnEnabled, taxiReturnDate, taxiReturnTime, taxiReturnAddress, taxiAddonTotal,
    dogsCount, validCustomLines,
  } = args;

  let resolvedClientId = clientId;
  let resolvedPetIds = selectedPetIds;

  if (isWalkIn) {
    const wiRes = await fetch('/api/admin/walkin-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: walkInName.trim(), phone: walkInPhone.trim() || null }),
    });
    if (!wiRes.ok) {
      throw new Error(fr ? 'Création client de passage échouée' : 'Walk-in client creation failed');
    }
    const wiClient = await wiRes.json() as { id: string };
    resolvedClientId = wiClient.id;

    const validWalkInPets = walkInPets.filter(p => p.name.trim().length > 0 && p.dateOfBirth);
    const petsRes = await fetch(`/api/admin/clients/${resolvedClientId}/pets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pets: validWalkInPets.map(p => ({
          name: p.name.trim(),
          species: p.species,
          dateOfBirth: p.dateOfBirth,
        })),
      }),
    });
    if (!petsRes.ok) {
      throw new Error(fr ? 'Création des animaux échouée' : 'Pet creation failed');
    }
    const petsPayload = await petsRes.json() as { pets: { id: string }[] };
    resolvedPetIds = petsPayload.pets.map(p => p.id);
  }

  const bookingBody: ClientBookingCreateBody = {
    clientId: resolvedClientId,
    serviceType,
    petIds: resolvedPetIds,
    startDate: serviceType === 'PET_TAXI' ? taxiDate : startDate,
    endDate: serviceType === 'BOARDING' ? endDate : null,
    arrivalTime: serviceType === 'PET_TAXI' ? taxiTime : null,
    notes: notes.trim() || null,
    totalPrice: finalTotal,
    source: 'MANUAL',
    ...(serviceType === 'BOARDING'
      ? {
          includeGrooming: groomingEnabled,
          groomingSize: groomingEnabled && dogsCount > 0 ? groomingSize : null,
          groomingPrice: groomingTotal,
          taxiGoEnabled,
          taxiGoDate: taxiGoEnabled ? taxiGoDate : null,
          taxiGoTime: taxiGoEnabled ? taxiGoTime : null,
          taxiGoAddress: taxiGoEnabled ? taxiGoAddress.trim() : null,
          taxiReturnEnabled,
          taxiReturnDate: taxiReturnEnabled ? taxiReturnDate : null,
          taxiReturnTime: taxiReturnEnabled ? taxiReturnTime : null,
          taxiReturnAddress: taxiReturnEnabled ? taxiReturnAddress.trim() : null,
          taxiAddonPrice: taxiAddonTotal,
        }
      : { taxiType }),
    ...(validCustomLines.length > 0
      ? {
          bookingItems: validCustomLines.map((l) => ({
            description: l.description.trim(),
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        }
      : {}),
  };

  const bookingResult = await createClientBooking(bookingBody);
  if (!bookingResult.ok) {
    throw new Error(bookingResult.error.code);
  }

  let invoiceCreated = false;
  if (isWalkIn) {
    try {
      const invoiceBody: CreateInvoiceBody = {
        clientId: resolvedClientId,
        ...(bookingResult.data.id ? { bookingId: bookingResult.data.id } : {}),
        serviceType: serviceType === 'BOARDING' ? 'BOARDING' : 'PET_TAXI',
        issuedAt: serviceType === 'PET_TAXI' ? taxiDate : startDate,
        items: [
          {
            description: serviceType === 'BOARDING' ? (fr ? 'Pension' : 'Boarding') : 'Pet Taxi',
            quantity: 1,
            unitPrice: finalTotal,
            total: finalTotal,
            category: serviceType === 'BOARDING' ? 'BOARDING' : 'PET_TAXI',
          },
        ],
      };
      const invResult = await createInvoice(invoiceBody);
      if (invResult.ok) {
        invoiceCreated = true;
      } else {
        logger.error('walk-in-booking', 'Auto-invoice failed', {
          status: invResult.status,
          error: invResult.error.code,
        });
      }
    } catch (err) {
      logger.error('walk-in-booking', 'Auto-invoice threw', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { invoiceCreated };
}
