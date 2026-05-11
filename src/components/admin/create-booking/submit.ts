import { logger } from '@/lib/logger';
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

  const body: Record<string, unknown> = {
    clientId: resolvedClientId,
    serviceType,
    petIds: resolvedPetIds,
    startDate: serviceType === 'PET_TAXI' ? taxiDate : startDate,
    endDate: serviceType === 'BOARDING' ? endDate : null,
    arrivalTime: serviceType === 'PET_TAXI' ? taxiTime : null,
    notes: notes.trim() || null,
    totalPrice: finalTotal,
    source: 'MANUAL',
  };

  if (serviceType === 'BOARDING') {
    Object.assign(body, {
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
    });
  } else {
    body.taxiType = taxiType;
  }

  if (validCustomLines.length > 0) {
    body.bookingItems = validCustomLines.map(l => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.quantity * l.unitPrice,
    }));
  }

  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'INTERNAL_ERROR');
  }

  let invoiceCreated = false;
  if (isWalkIn) {
    try {
      const bookingResult = await res.json().catch(() => ({})) as { id?: string };
      const invRes = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: resolvedClientId,
          serviceType,
          issuedAt: serviceType === 'PET_TAXI' ? taxiDate : startDate,
          ...(bookingResult.id ? { bookingId: bookingResult.id } : {}),
          items: [{
            description: serviceType === 'BOARDING' ? (fr ? 'Pension' : 'Boarding') : 'Pet Taxi',
            quantity: 1,
            unitPrice: finalTotal,
            total: finalTotal,
            category: serviceType === 'BOARDING' ? 'BOARDING' : 'PET_TAXI',
          }],
        }),
      });
      if (invRes.ok) {
        invoiceCreated = true;
      } else {
        const invErr = await invRes.json().catch(() => ({}));
        logger.error('walk-in-booking', 'Auto-invoice failed', { status: invRes.status, error: invErr });
      }
    } catch (err) {
      logger.error('walk-in-booking', 'Auto-invoice threw', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { invoiceCreated };
}
