'use client';

// Slim orchestrator — see _components/ for the section sub-components.
// State is intentionally lifted up here because handleSubmit() needs to
// read everything atomically; sub-components are pure presentational
// slices. This file went from 748 LOC to ~280 by extracting the JSX
// sections; logic (validate / handleSubmit / suggestedPrice memo) stays
// here so the workflow remains in one place.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  type PricingSettings,
} from '@/lib/pricing-rules';
import type { ClientLite, InitialStatus, Species, Translations, WalkInPet } from './_components/types';
import { ClientSection } from './_components/ClientSection';
import { PetsSection } from './_components/PetsSection';
import { DatesSection } from './_components/DatesSection';
import { StatusAndPriceSection } from './_components/StatusAndPriceSection';

type Props = {
  clients: ClientLite[];
  locale: string;
  pricing: PricingSettings;
};

const L: Record<'fr' | 'en', Translations> = {
  fr: {
    clientSection: 'Client',
    selectClient: 'Sélectionner un client',
    search: 'Rechercher (nom ou email)',
    walkInToggle: "Walk-in (client non inscrit dans l'app)",
    walkInName: 'Nom complet',
    walkInPhone: 'Téléphone',
    walkInEmail: 'Email (optionnel)',
    petsSection: 'Animaux',
    addPet: 'Ajouter un animal',
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
    startDate: "Date d'arrivée",
    endDate: 'Date de départ',
    arrivalTime: 'Heure',
    openEndedToggle: 'Durée indéterminée (walk-in ouvert)',
    openEndedNote: 'Le prix sera calculé automatiquement à la clôture selon le nombre réel de nuits.',
    statusSection: 'Statut initial',
    statusHelp: 'Dans quel état créer cette réservation ?',
    statusPending: 'En attente',
    statusConfirmed: 'Confirmée',
    statusInProgress: 'En cours (chien déjà là)',
    statusCompleted: 'Terminée (saisie rétroactive)',
    retroAmountSection: 'Montant payé',
    retroAmount: 'Montant (MAD)',
    retroAmountHelp: 'Obligatoire pour une saisie rétroactive — génère une facture PAYÉE.',
    taxiMismatchWarning: 'Le chien est marqué comme déjà arrivé. Le taxi aller doit être désactivé ou le statut passé à "Confirmée".',
    priceSection: 'Tarif',
    totalPrice: 'Prix total (MAD)',
    suggested: 'Suggéré',
    invoiceSection: 'Facturation',
    createInvoice: 'Créer la facture automatiquement',
    notesSection: 'Notes internes',
    submit: 'Créer la réservation',
    submitting: 'Création…',
    cancel: 'Annuler',
    noPets: "Ce client n'a pas d'animal enregistré.",
    sundayInvalid: "Le Pet Taxi n'opère pas le dimanche.",
    timeInvalid: 'Le Pet Taxi opère entre 10h et 17h.',
    walkInPetsRequired: 'Ajoutez au moins un animal pour ce client.',
    petsRequired: 'Sélectionnez au moins un animal.',
    retroAmountRequired: 'Le montant est obligatoire pour une saisie rétroactive.',
    error: 'Erreur',
    success: 'Réservation créée',
    capacity: 'La pension est complète pour ces dates',
  },
  en: {
    clientSection: 'Client',
    selectClient: 'Select a client',
    search: 'Search (name or email)',
    walkInToggle: 'Walk-in (client not in the app)',
    walkInName: 'Full name',
    walkInPhone: 'Phone',
    walkInEmail: 'Email (optional)',
    petsSection: 'Pets',
    addPet: 'Add a pet',
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
    openEndedToggle: 'Open-ended (walk-in)',
    openEndedNote: 'Price is computed at checkout based on actual nights.',
    statusSection: 'Initial status',
    statusHelp: 'What state should this booking be created in?',
    statusPending: 'Pending',
    statusConfirmed: 'Confirmed',
    statusInProgress: 'In progress (pet is already here)',
    statusCompleted: 'Completed (retroactive entry)',
    retroAmountSection: 'Amount paid',
    retroAmount: 'Amount (MAD)',
    retroAmountHelp: 'Required for retroactive entry — generates a PAID invoice.',
    taxiMismatchWarning: 'The dog is marked as already arrived. Disable the outbound taxi or switch the status to "Confirmed".',
    priceSection: 'Price',
    totalPrice: 'Total price (MAD)',
    suggested: 'Suggested',
    invoiceSection: 'Invoicing',
    createInvoice: 'Create invoice automatically',
    notesSection: 'Internal notes',
    submit: 'Create booking',
    submitting: 'Creating…',
    cancel: 'Cancel',
    noPets: 'This client has no registered pets.',
    sundayInvalid: 'Pet Taxi does not operate on Sundays.',
    timeInvalid: 'Pet Taxi operates between 10:00 and 17:00.',
    walkInPetsRequired: 'Add at least one pet for this client.',
    petsRequired: 'Select at least one pet.',
    retroAmountRequired: 'Amount is required for a retroactive entry.',
    error: 'Error',
    success: 'Booking created',
    capacity: 'Boarding is full for these dates',
  },
};

export function NewBookingForm({ clients, locale, pricing }: Props) {
  const router = useRouter();
  const t = (L as Record<string, Translations>)[locale] ?? L.fr;

  // ── Client ────────────────────────────────────────────────────────────
  const [walkInMode, setWalkInMode] = useState(false);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', email: '' });
  const [walkInPets, setWalkInPets] = useState<WalkInPet[]>([
    { name: '', species: 'DOG', dateOfBirth: '', breed: '' },
  ]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  // ── Service ───────────────────────────────────────────────────────────
  const [serviceType, setServiceType] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');

  // ── Dates ─────────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [isOpenEnded, setIsOpenEnded] = useState(false);

  // ── Walk-in initial status ────────────────────────────────────────────
  const [initialStatus, setInitialStatus] = useState<InitialStatus>('IN_PROGRESS');
  const [finalAmount, setFinalAmount] = useState('');

  // ── Billing ───────────────────────────────────────────────────────────
  const [totalPrice, setTotalPrice] = useState<string>('0');
  const [createInvoice, setCreateInvoice] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // COMPLETED is incompatible with open-ended — force off (mirrored in
  // children where needed).
  const effectiveIsOpenEnded = isOpenEnded && initialStatus !== 'COMPLETED';

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const calendarSpecies: Species = useMemo(() => {
    if (walkInMode) return walkInPets[0]?.species ?? 'DOG';
    const firstSelected = selectedClient?.pets.find((p) => selectedPetIds.includes(p.id));
    return (firstSelected?.species as Species) ?? 'DOG';
  }, [walkInMode, walkInPets, selectedClient, selectedPetIds]);

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

  const onCalendarRange = (s: string, e: string | null) => {
    setStartDate(s);
    if (e) setEndDate(e);
  };

  function validate(): string | null {
    if (walkInMode) {
      if (!walkIn.name.trim() || !walkIn.phone.trim()) return t.walkInName;
      if (walkInPets.filter((p) => p.name.trim()).length === 0) return t.walkInPetsRequired;
    } else {
      if (!clientId) return t.selectClient;
      if (selectedPetIds.length === 0) return t.petsRequired;
    }
    if (!startDate) return t.startDate;
    if (serviceType === 'BOARDING' && !endDate && !effectiveIsOpenEnded) return t.endDate;
    if (serviceType === 'PET_TAXI') {
      const d = new Date(startDate + 'T00:00:00');
      if (d.getDay() === 0) return t.sundayInvalid;
      if (arrivalTime) {
        const [h, m] = arrivalTime.split(':').map(Number);
        const total = h * 60 + (m || 0);
        if (total < 10 * 60 || total > 17 * 60) return t.timeInvalid;
      }
    }
    if (initialStatus === 'COMPLETED') {
      const amt = parseFloat(finalAmount);
      if (isNaN(amt) || amt < 0) return t.retroAmountRequired;
    } else if (!effectiveIsOpenEnded) {
      const price = parseFloat(totalPrice);
      if (isNaN(price) || price < 0) return t.totalPrice;
    }
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
        endDate: serviceType === 'BOARDING' && !effectiveIsOpenEnded ? endDate || null : null,
        arrivalTime: serviceType === 'PET_TAXI' ? arrivalTime : null,
        totalPrice: effectiveIsOpenEnded ? 0 : parseFloat(totalPrice),
        notes: notes.trim() || null,
        createInvoice,
        isOpenEnded: effectiveIsOpenEnded,
        initialStatus,
        finalAmount: initialStatus === 'COMPLETED' ? parseFloat(finalAmount) : null,
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
    setSelectedPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ClientSection
        t={t}
        clients={clients}
        walkInMode={walkInMode}
        setWalkInMode={setWalkInMode}
        search={search}
        setSearch={setSearch}
        clientId={clientId}
        setClientId={setClientId}
        walkIn={walkIn}
        setWalkIn={setWalkIn}
        onClientSwitch={() => setSelectedPetIds([])}
      />

      <PetsSection
        t={t}
        walkInMode={walkInMode}
        selectedClient={selectedClient}
        selectedPetIds={selectedPetIds}
        togglePet={togglePet}
        walkInPets={walkInPets}
        setWalkInPets={setWalkInPets}
      />

      {/* Service section — small, kept inline */}
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
                onChange={() => {
                  setServiceType(s);
                  if (s === 'PET_TAXI') setIsOpenEnded(false);
                }}
                className="mr-2"
              />
              {s === 'BOARDING' ? t.boarding : t.taxi}
            </label>
          ))}
        </div>
      </section>

      <DatesSection
        t={t}
        serviceType={serviceType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        arrivalTime={arrivalTime}
        setArrivalTime={setArrivalTime}
        isOpenEnded={isOpenEnded}
        setIsOpenEnded={setIsOpenEnded}
        initialStatus={initialStatus}
        calendarSpecies={calendarSpecies}
        onCalendarRange={onCalendarRange}
      />

      <StatusAndPriceSection
        t={t}
        initialStatus={initialStatus}
        setInitialStatus={setInitialStatus}
        setIsOpenEnded={setIsOpenEnded}
        effectiveIsOpenEnded={effectiveIsOpenEnded}
        finalAmount={finalAmount}
        setFinalAmount={setFinalAmount}
        totalPrice={totalPrice}
        setTotalPrice={setTotalPrice}
        createInvoice={createInvoice}
        setCreateInvoice={setCreateInvoice}
        suggestedPrice={suggestedPrice}
      />

      {/* Notes section — small, kept inline */}
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
