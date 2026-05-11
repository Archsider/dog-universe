import { useState } from 'react';
import type { GroomingSize, TaxiType } from '@/lib/pricing-client';
import { todayIso, todayMinusYears, type Pet, type CustomLine, type WalkInPet } from './lib';

export interface BookingFormStateInit {
  preselectedClientId?: string;
  preselectedPets?: Pet[];
}

export type BookingFormState = ReturnType<typeof useBookingFormState>;

export function useBookingFormState({ preselectedClientId, preselectedPets }: BookingFormStateInit) {
  const [clientId, setClientId] = useState(preselectedClientId ?? '');
  const [clientPets, setClientPets] = useState<Pet[]>(preselectedPets ?? []);
  const [loadingPets, setLoadingPets] = useState(false);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInPets, setWalkInPets] = useState<WalkInPet[]>([
    { name: '', species: 'DOG', dateOfBirth: todayMinusYears(3) },
  ]);

  const [serviceType, setServiceType] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');

  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [groomingEnabled, setGroomingEnabled] = useState(false);
  const [groomingSize, setGroomingSize] = useState<GroomingSize>('SMALL');
  const [taxiGoEnabled, setTaxiGoEnabled] = useState(false);
  const [taxiGoDate, setTaxiGoDate] = useState('');
  const [taxiGoTime, setTaxiGoTime] = useState('10:00');
  const [taxiGoAddress, setTaxiGoAddress] = useState('');
  const [taxiReturnEnabled, setTaxiReturnEnabled] = useState(false);
  const [taxiReturnDate, setTaxiReturnDate] = useState('');
  const [taxiReturnTime, setTaxiReturnTime] = useState('10:00');
  const [taxiReturnAddress, setTaxiReturnAddress] = useState('');

  const [taxiType, setTaxiType] = useState<TaxiType>('STANDARD');
  const [taxiDate, setTaxiDate] = useState(todayIso());
  const [taxiTime, setTaxiTime] = useState('10:00');

  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [showCustomLines, setShowCustomLines] = useState(false);

  const [manualOverride, setManualOverride] = useState(false);
  const [manualTotal, setManualTotal] = useState('');

  const [notes, setNotes] = useState('');

  const reset = () => {
    if (!preselectedClientId) { setClientId(''); setClientPets([]); }
    setSelectedPetIds([]);
    setWalkInName('');
    setWalkInPhone('');
    setWalkInPets([{ name: '', species: 'DOG', dateOfBirth: todayMinusYears(3) }]);
    setServiceType('BOARDING');
    setStartDate(todayIso());
    setEndDate('');
    setGroomingEnabled(false);
    setGroomingSize('SMALL');
    setTaxiGoEnabled(false);
    setTaxiGoDate('');
    setTaxiGoTime('10:00');
    setTaxiGoAddress('');
    setTaxiReturnEnabled(false);
    setTaxiReturnDate('');
    setTaxiReturnTime('10:00');
    setTaxiReturnAddress('');
    setTaxiType('STANDARD');
    setTaxiDate(todayIso());
    setTaxiTime('10:00');
    setCustomLines([]);
    setShowCustomLines(false);
    setManualOverride(false);
    setManualTotal('');
    setNotes('');
  };

  return {
    clientId, setClientId, clientPets, setClientPets, loadingPets, setLoadingPets,
    selectedPetIds, setSelectedPetIds,
    walkInName, setWalkInName, walkInPhone, setWalkInPhone, walkInPets, setWalkInPets,
    serviceType, setServiceType,
    startDate, setStartDate, endDate, setEndDate,
    groomingEnabled, setGroomingEnabled, groomingSize, setGroomingSize,
    taxiGoEnabled, setTaxiGoEnabled, taxiGoDate, setTaxiGoDate, taxiGoTime, setTaxiGoTime, taxiGoAddress, setTaxiGoAddress,
    taxiReturnEnabled, setTaxiReturnEnabled, taxiReturnDate, setTaxiReturnDate, taxiReturnTime, setTaxiReturnTime, taxiReturnAddress, setTaxiReturnAddress,
    taxiType, setTaxiType, taxiDate, setTaxiDate, taxiTime, setTaxiTime,
    customLines, setCustomLines, showCustomLines, setShowCustomLines,
    manualOverride, setManualOverride, manualTotal, setManualTotal,
    notes, setNotes,
    reset,
  };
}
