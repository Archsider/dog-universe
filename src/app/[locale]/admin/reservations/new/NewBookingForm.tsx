'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { AvailabilityCalendar } from '@/components/shared/AvailabilityCalendar';
import {
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  type PricingSettings,
} from '@/lib/pricing-rules';

type PetLite = { id: string; name: string; species: 'DOG' | 'CAT'; dateOfBirth: string | null };
type ClientLite = { id: string; name: string; email: string; phone: string | null; pets: PetLite[] };

type Props = {
  clients: ClientLite[];
  locale: string;
  pricing: PricingSettings;
};

type WalkInPet = { name: string; species: 'DOG' | 'CAT'; dateOfBirth: string; breed: string };

const L = {
  fr: {
    clientSection: 'Client',
    selectClient: 'Sélectionner un client',
    search: 'Rechercher (nom ou email)',
    walkInToggle: 'Nouveau client de passage (walk-in)',
    walkInName: 'Nom complet',
    walkInPhone: 'Téléphone',
    walkInEmail: 'Email (optionnel)',
    petsSection: 'Animaux',
    addPet: 'Ajouter un animal',
    removePet: 'Retirer',
    petName: 'Nom',
    species: 'Espèce',
    dog: 'Chien',
    cat: 'Chat',
    dob: 'Date de naissance (optionnel)',
    breed: 'Race (optionnel)',
    serviceSection: 'Service',
    boarding: 'Pension',
    taxi: 'Pet Taxi',
    datesSection: 'Dates',
    startDate: 'Date d\'arrivée',
    endDate: 'Date de départ',
    arrivalTime: 'Heure',
    priceSection: 'Tarif',
    totalPrice: 'Prix total (MAD)',
    suggested: 'Suggéré',
    invoiceSection: 'Facturation',
    createInvoice: 'Créer la facture automatiquement',
    notesSection: 'Notes internes',
    submit: 'Créer la réservation',
    submitting: 'Création…',
    cancel: 'Annuler',
    noPets: 'Ce client n\'a pas d\'animal enregistré.',
    selectPets: 'Sélectionner les animaux',
    sundayInvalid: 'Le Pet Taxi n\'opère pas le dimanche.',
    timeInvalid: 'Le Pet Taxi opère entre 10h et 17h.',
    walkInPetsRequired: 'Ajoutez au moins un animal pour ce client.',
    petsRequired: 'Sélectionnez au moins un animal.',
    error: 'Erreur',
    success: 'Réservation créée',
    capacity: 'La pension est complète pour ces dates',
  },
  en: {
    clientSection: 'Client',
    selectClient: 'Select a client',
    search: 'Search (name or email)',
    walkInToggle: 'Walk-in client (no portal)',
    walkInName: 'Full name',
    walkInPhone: 'Phone',
    walkInEmail: 'Email (optional)',
    petsSection: 'Pets',
    addPet: 'Add a pet',
    removePet: 'Remove',
    petName: 'Name',
    species: 'Species',
    dog: 'Dog',
    cat: 'Cat',
    dob: 'Date of birth (optional)',
    breed: 'Breed (optional)',
    serviceSection: 'Service',
    boarding: 'Boarding',
    taxi: 'Pet Taxi',
    datesSection: 'Dates',
    startDate: 'Arrival date',
    endDate: 'Departure date',
    arrivalTime: 'Time',
    priceSection: 'Price',
    totalPrice: 'Total price (MAD)',
    suggested: 'Suggested',
    invoiceSection: 'Invoicing',
    createInvoice: 'Auto-create invoice',
    notesSection: 'Internal notes',
    submit: 'Create booking',
    submitting: 'Creating…',
    cancel: 'Cancel',
    noPets: 'This client has no pet registered.',
    selectPets: 'Select pets',
    sundayInvalid: 'Pet Taxi does not operate on Sundays.',
    timeInvalid: 'Pet Taxi operates between 10:00 and 17:00.',
    walkInPetsRequired: 'Add at least one pet for this client.',
    petsRequired: 'Select at least one pet.',
    error: 'Error',
    success: 'Booking created',
    capacity: 'Boarding is full for these dates',
  },
};

export function NewBookingForm({ clients, locale, pricing }: Props) {
  const router = useRouter();
  const t = (L as Record<string, typeof L.fr>)[locale] || L.fr;

  const [walkInMode, setWalkInMode] = useState(false);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', email: '' });
  const [walkInPets, setWalkInPets] = useState<WalkInPet[]>([
    { name: '', species: 'DOG', dateOfBirth: '', breed: '' },
  ]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [totalPrice, setTotalPrice] = useState<string>('');
  const [createInvoice, setCreateInvoice] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clients, search]);

  const selectedClient = clients.find((c) => c.id === clientId) || null;

  // Suggested price uses calculateBoardingBreakdown / calculateTaxiPrice from
  // pricing-rules (single source of truth, same engine as the client booking
  // flow and admin extension recalculations).
  const suggestedPrice = useMemo(() => {
    if (serviceType === 'PET_TAXI') {
      return calculateTaxiPrice('STANDARD', pricing).total;
    }
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

    const pets = walkInMode
      ? walkInPets
          .filter((p) => p.name.trim())
          .map((p, i) => ({ id: `wi-${i}`, name: p.name.trim(), species: p.species }))
      : (selectedClient?.pets.filter((p) => selectedPetIds.includes(p.id)) ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          species: p.species,
        }));

    if (pets.length === 0) return 0;
    return calculateBoardingBreakdown(nights, pets, undefined, false, false, pricing).total;
  }, [serviceType, startDate, endDate, walkInMode, walkInPets, selectedPetIds, selectedClient, pricing]);

  // Mirror calendar selection.
  const onCalendarRange = (s: string, e: string | null) => {
    setStartDate(s);
    if (e) setEndDate(e);
  };

  const calendarSpecies: 'DOG' | 'CAT' = useMemo(() => {
    if (walkInMode) return walkInPets[0]?.species ?? 'DOG';
    const firstSelected = selectedClient?.pets.find((p) => selectedPetIds.includes(p.id));
    return (firstSelected?.species as 'DOG' | 'CAT') ?? 'DOG';
  }, [walkInMode, walkInPets, selectedClient, selectedPetIds]);

  function validate(): string | null {
    if (walkInMode) {
      if (!walkIn.name.trim() || !walkIn.phone.trim()) return t.walkInName;
      const validPets = walkInPets.filter((p) => p.name.trim());
      if (validPets.length === 0) return t.walkInPetsRequired;
    } else {
      if (!clientId) return t.selectClient;
      if (selectedPetIds.length === 0) return t.petsRequired;
    }
    if (!startDate) return t.startDate;
    if (serviceType === 'BOARDING' && !endDate) return t.endDate;
    if (serviceType === 'PET_TAXI') {
      const d = new Date(startDate + 'T00:00:00');
      if (d.getDay() === 0) return t.sundayInvalid;
      if (arrivalTime) {
        const [h, m] = arrivalTime.split(':').map(Number);
        const total = h * 60 + (m || 0);
        if (total < 10 * 60 || total > 17 * 60) return t.timeInvalid;
      }
    }
    const price = parseFloat(totalPrice);
    if (isNaN(price) || price < 0) return t.totalPrice;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: t.error, description: err, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        serviceType,
        startDate,
        endDate: serviceType === 'BOARDING' ? endDate : null,
        arrivalTime: serviceType === 'PET_TAXI' ? arrivalTime : null,
        totalPrice: parseFloat(totalPrice),
        notes: notes.trim() || null,
        createInvoice,
      };
      if (walkInMode) {
        payload.walkIn = {
          name: walkIn.name.trim(),
          phone: walkIn.phone.trim(),
          email: walkIn.email.trim() || null,
        };
        payload.pets = walkInPets
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            species: p.species,
            dateOfBirth: p.dateOfBirth || null,
            breed: p.breed.trim() || null,
          }));
      } else {
        payload.clientId = clientId;
        payload.petIds = selectedPetIds;
      }

      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error === 'CAPACITY_EXCEEDED' ? t.capacity : data.error || t.error;
        toast({ title: t.error, description: String(msg), variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      toast({ title: t.success, variant: 'success' });
      router.push(`/${locale}/admin/reservations/${data.booking.id}`);
    } catch (err) {
      toast({
        title: t.error,
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  }

  function togglePet(id: string) {
    setSelectedPetIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function updateWalkInPet(idx: number, patch: Partial<WalkInPet>) {
    setWalkInPets((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client section */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.clientSection}</h2>
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={walkInMode}
            onChange={(e) => {
              setWalkInMode(e.target.checked);
              setClientId('');
              setSelectedPetIds([]);
            }}
            className="h-4 w-4"
          />
          <span className="text-sm text-charcoal">{t.walkInToggle}</span>
        </label>

        {walkInMode ? (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="wi-name">{t.walkInName} *</Label>
              <Input
                id="wi-name"
                value={walkIn.name}
                onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="wi-phone">{t.walkInPhone} *</Label>
              <Input
                id="wi-phone"
                value={walkIn.phone}
                onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="wi-email">{t.walkInEmail}</Label>
              <Input
                id="wi-email"
                type="email"
                value={walkIn.email}
                onChange={(e) => setWalkIn({ ...walkIn, email: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <>
            <Label htmlFor="search">{t.search}</Label>
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto border border-ivory-200 rounded-lg">
              {filteredClients.length === 0 ? (
                <div className="p-3 text-sm text-gray-400">—</div>
              ) : (
                filteredClients.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setClientId(c.id);
                      setSelectedPetIds([]);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors ${clientId === c.id ? 'bg-gold-50' : ''}`}
                  >
                    <div className="font-medium text-charcoal">{c.name}</div>
                    <div className="text-xs text-gray-500">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''} · {c.pets.length} 🐾
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {/* Pets */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.petsSection}</h2>
        {walkInMode ? (
          <div className="space-y-3">
            {walkInPets.map((p, i) => (
              <div key={i} className="grid sm:grid-cols-5 gap-2 items-end">
                <div className="sm:col-span-2">
                  <Label>{t.petName} *</Label>
                  <Input
                    value={p.name}
                    onChange={(e) => updateWalkInPet(i, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t.species}</Label>
                  <select
                    value={p.species}
                    onChange={(e) =>
                      updateWalkInPet(i, { species: e.target.value as 'DOG' | 'CAT' })
                    }
                    className="w-full h-10 px-3 rounded-lg border border-ivory-200 bg-white text-sm"
                  >
                    <option value="DOG">{t.dog}</option>
                    <option value="CAT">{t.cat}</option>
                  </select>
                </div>
                <div>
                  <Label>{t.dob}</Label>
                  <Input
                    type="date"
                    value={p.dateOfBirth}
                    onChange={(e) => updateWalkInPet(i, { dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t.breed}
                    value={p.breed}
                    onChange={(e) => updateWalkInPet(i, { breed: e.target.value })}
                  />
                  {walkInPets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setWalkInPets((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setWalkInPets((prev) => [
                  ...prev,
                  { name: '', species: 'DOG', dateOfBirth: '', breed: '' },
                ])
              }
            >
              + {t.addPet}
            </Button>
          </div>
        ) : !selectedClient ? (
          <p className="text-sm text-gray-400">{t.selectClient}</p>
        ) : selectedClient.pets.length === 0 ? (
          <p className="text-sm text-gray-400">{t.noPets}</p>
        ) : (
          <div className="space-y-1">
            {selectedClient.pets.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-ivory-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedPetIds.includes(p.id)}
                  onChange={() => togglePet(p.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  {p.name}{' '}
                  <span className="text-xs text-gray-500">
                    ({p.species === 'DOG' ? t.dog : t.cat})
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Service */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.serviceSection}</h2>
        <div className="flex gap-3">
          {(['BOARDING', 'PET_TAXI'] as const).map((s) => (
            <label
              key={s}
              className={`flex-1 cursor-pointer border rounded-lg p-3 transition-colors ${serviceType === s ? 'border-gold-500 bg-gold-50' : 'border-ivory-200'}`}
            >
              <input
                type="radio"
                name="serviceType"
                value={s}
                checked={serviceType === s}
                onChange={() => setServiceType(s)}
                className="mr-2"
              />
              {s === 'BOARDING' ? t.boarding : t.taxi}
            </label>
          ))}
        </div>
      </section>

      {/* Dates */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.datesSection}</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <Label htmlFor="start">{t.startDate} *</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          {serviceType === 'BOARDING' ? (
            <div>
              <Label htmlFor="end">{t.endDate} *</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="time">{t.arrivalTime}</Label>
              <Input
                id="time"
                type="time"
                min="10:00"
                max="17:00"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
              />
            </div>
          )}
        </div>

        {serviceType === 'BOARDING' && (
          <AvailabilityCalendar
            species={calendarSpecies}
            selectedStart={startDate || null}
            selectedEnd={endDate || null}
            onRangeSelect={onCalendarRange}
            interactive
          />
        )}
      </section>

      {/* Price */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.priceSection}</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="price">{t.totalPrice} *</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              required
            />
          </div>
          {suggestedPrice > 0 && (
            <button
              type="button"
              onClick={() => setTotalPrice(String(suggestedPrice))}
              className="text-xs text-gold-600 hover:text-gold-700 underline pb-2"
            >
              {t.suggested}: {suggestedPrice} MAD
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={createInvoice}
            onChange={(e) => setCreateInvoice(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">{t.createInvoice}</span>
        </label>
      </section>

      {/* Notes */}
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-3">{t.notesSection}</h2>
        <Textarea
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? t.submitting : t.submit}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
