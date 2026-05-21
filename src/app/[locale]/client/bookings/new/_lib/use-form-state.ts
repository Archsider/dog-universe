'use client';

import { useState } from 'react';
import type { Pet, PetSize, TaxiType } from './types';

/**
 * Single hook bundling every wizard form-field state. Returned object exposes
 * grouped sub-objects so step components can be wired with one prop bundle
 * instead of a long flat prop list.
 */
export function useFormState(initialSelectedPets: string[]) {
  const [selectedPets, setSelectedPets] = useState<string[]>(initialSelectedPets);

  // Boarding dates
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  // Boarding extras
  const [groomingPets, setGroomingPets] = useState<Record<string, boolean>>({});
  const [petSizes, setPetSizes] = useState<Record<string, PetSize>>({});
  const [boardingNotes, setBoardingNotes] = useState('');

  // Taxi addon — aller
  const [taxiGoEnabled, setTaxiGoEnabled] = useState(false);
  const [taxiGoDate, setTaxiGoDate] = useState('');
  const [taxiGoTime, setTaxiGoTime] = useState('');
  const [taxiGoAddress, setTaxiGoAddress] = useState('');
  const [taxiGoPlaceName, setTaxiGoPlaceName] = useState('');
  const [taxiGoLat, setTaxiGoLat] = useState<number | null>(null);
  const [taxiGoLng, setTaxiGoLng] = useState<number | null>(null);
  const [geolocatingGo, setGeolocatingGo] = useState(false);

  // Taxi addon — retour
  const [taxiReturnEnabled, setTaxiReturnEnabled] = useState(false);
  const [taxiReturnDate, setTaxiReturnDate] = useState('');
  const [taxiReturnTime, setTaxiReturnTime] = useState('');
  const [taxiReturnAddress, setTaxiReturnAddress] = useState('');
  const [taxiReturnPlaceName, setTaxiReturnPlaceName] = useState('');
  const [taxiReturnLat, setTaxiReturnLat] = useState<number | null>(null);
  const [taxiReturnLng, setTaxiReturnLng] = useState<number | null>(null);
  const [geolocatingReturn, setGeolocatingReturn] = useState(false);

  // Standalone taxi
  const [taxiType, setTaxiType] = useState<TaxiType>('STANDARD');
  const [taxiDate, setTaxiDate] = useState('');
  const [taxiTime, setTaxiTime] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  // Nom résidence/villa/n° appart — OBLIGATOIRE. Le GPS Nominatim n'est pas
  // assez précis ; ce nom est ce que la sécurité demande au chauffeur.
  const [pickupPlaceName, setPickupPlaceName] = useState('');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [geolocating, setGeolocating] = useState(false);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [taxiNotes, setTaxiNotes] = useState('');

  return {
    selectedPets, setSelectedPets,
    boarding: {
      checkIn, setCheckIn, checkOut, setCheckOut,
      groomingPets, setGroomingPets, petSizes, setPetSizes,
      notes: boardingNotes, setNotes: setBoardingNotes,
    },
    taxiGo: {
      enabled: taxiGoEnabled, setEnabled: setTaxiGoEnabled,
      date: taxiGoDate, setDate: setTaxiGoDate,
      time: taxiGoTime, setTime: setTaxiGoTime,
      address: taxiGoAddress, setAddress: setTaxiGoAddress,
      placeName: taxiGoPlaceName, setPlaceName: setTaxiGoPlaceName,
      lat: taxiGoLat, setLat: setTaxiGoLat,
      lng: taxiGoLng, setLng: setTaxiGoLng,
      geolocating: geolocatingGo, setGeolocating: setGeolocatingGo,
    },
    taxiReturn: {
      enabled: taxiReturnEnabled, setEnabled: setTaxiReturnEnabled,
      date: taxiReturnDate, setDate: setTaxiReturnDate,
      time: taxiReturnTime, setTime: setTaxiReturnTime,
      address: taxiReturnAddress, setAddress: setTaxiReturnAddress,
      placeName: taxiReturnPlaceName, setPlaceName: setTaxiReturnPlaceName,
      lat: taxiReturnLat, setLat: setTaxiReturnLat,
      lng: taxiReturnLng, setLng: setTaxiReturnLng,
      geolocating: geolocatingReturn, setGeolocating: setGeolocatingReturn,
    },
    taxi: {
      type: taxiType, setType: setTaxiType,
      date: taxiDate, setDate: setTaxiDate,
      time: taxiTime, setTime: setTaxiTime,
      pickupAddress, setPickupAddress,
      pickupPlaceName, setPickupPlaceName,
      pickupLat, setPickupLat, pickupLng, setPickupLng,
      geolocating, setGeolocating,
      dropoffAddress, setDropoffAddress,
      notes: taxiNotes, setNotes: setTaxiNotes,
    },
  };
}

export type FormState = ReturnType<typeof useFormState>;
export type BoardingState = FormState['boarding'];
export type TaxiAddonState = FormState['taxiGo']; // same shape for go/return
export type TaxiState = FormState['taxi'];

export type SelectedPetGroups = {
  selected: Pet[];
  dogs: Pet[];
  cats: Pet[];
};
