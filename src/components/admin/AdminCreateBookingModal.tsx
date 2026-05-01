'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Loader2, Calendar, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import {
  PRICING_DEFAULTS,
  parsePricingSettings,
  calcNights,
  calcBoardingLines,
  calcTaxiLine,
  calcGroomingTotal,
  type PetInfo,
  type GroomingSize,
  type TaxiType,
} from '@/lib/pricing-client';

interface Pet extends PetInfo {
  species: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
}

interface CustomLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  locale: string;
  preselectedClientId?: string;
  preselectedClientName?: string;
  preselectedPets?: Pet[];
  clients?: Client[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TAXI_TYPE_LABELS: { value: TaxiType; labelFr: string; labelEn: string; priceKey: keyof typeof PRICING_DEFAULTS }[] = [
  { value: 'STANDARD', labelFr: 'Course standard', labelEn: 'Standard trip', priceKey: 'taxi_standard' },
  { value: 'VET', labelFr: 'Transport vétérinaire', labelEn: 'Vet transport', priceKey: 'taxi_vet' },
  { value: 'AIRPORT', labelFr: 'Navette aéroport', labelEn: 'Airport shuttle', priceKey: 'taxi_airport' },
];

export default function AdminCreateBookingModal({
  locale,
  preselectedClientId,
  preselectedClientName,
  preselectedPets,
  clients = [],
}: Props) {
  const fr = locale === 'fr';
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<Record<string, number>>(PRICING_DEFAULTS);

  // ── Client & pets ──────────────────────────────────────────────────────────
  const [clientId, setClientId] = useState(preselectedClientId ?? '');
  const [clientPets, setClientPets] = useState<Pet[]>(preselectedPets ?? []);
  const [loadingPets, setLoadingPets] = useState(false);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  // ── Service type ───────────────────────────────────────────────────────────
  const [serviceType, setServiceType] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');

  // ── Boarding ───────────────────────────────────────────────────────────────
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

  // ── Pet Taxi ───────────────────────────────────────────────────────────────
  const [taxiType, setTaxiType] = useState<TaxiType>('STANDARD');
  const [taxiDate, setTaxiDate] = useState(todayIso());
  const [taxiTime, setTaxiTime] = useState('10:00');

  // ── Extra lines ────────────────────────────────────────────────────────────
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [showCustomLines, setShowCustomLines] = useState(false);

  // ── Total override ─────────────────────────────────────────────────────────
  const [manualOverride, setManualOverride] = useState(false);
  const [manualTotal, setManualTotal] = useState('');

  // ── Notes ──────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState('');

  // ── Load pricing settings once ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => setPricing(parsePricingSettings(data)))
      .catch(() => {/* keep defaults */});
  }, [open]);

  // ── Load pets when client changes ──────────────────────────────────────────
  useEffect(() => {
    if (!clientId || preselectedClientId) return;
    setLoadingPets(true);
    setSelectedPetIds([]);
    fetch(`/api/admin/clients/${clientId}`)
      .then(r => r.json())
      .then(data => setClientPets((data.pets ?? []).map((p: Pet) => ({ id: p.id, name: p.name, species: p.species }))))
      .catch(() => setClientPets([]))
      .finally(() => setLoadingPets(false));
  }, [clientId, preselectedClientId]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const nights = useMemo(() => calcNights(startDate, endDate), [startDate, endDate]);

  const selectedPets = useMemo(
    () => clientPets.filter(p => selectedPetIds.includes(p.id)),
    [clientPets, selectedPetIds],
  );

  const autoLines = useMemo(() => {
    if (serviceType === 'BOARDING') {
      return calcBoardingLines(
        nights,
        selectedPets,
        { groomingEnabled, groomingSize, taxiGoEnabled, taxiReturnEnabled },
        pricing,
      );
    }
    if (serviceType === 'PET_TAXI') {
      return [calcTaxiLine(taxiType, pricing)];
    }
    return [];
  }, [serviceType, nights, selectedPets, groomingEnabled, groomingSize, taxiGoEnabled, taxiReturnEnabled, taxiType, pricing]);

  const validCustomLines = useMemo(
    () => customLines.filter(l => l.description.trim() && l.quantity > 0 && l.unitPrice >= 0),
    [customLines],
  );

  const allLines = useMemo(() => [
    ...autoLines,
    ...validCustomLines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, total: l.quantity * l.unitPrice })),
  ], [autoLines, validCustomLines]);

  const computedTotal = useMemo(() => allLines.reduce((s, l) => s + l.total, 0), [allLines]);

  const finalTotal = useMemo(() => {
    if (manualOverride) {
      const v = parseFloat(manualTotal);
      return isNaN(v) ? 0 : v;
    }
    return computedTotal;
  }, [manualOverride, manualTotal, computedTotal]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const togglePet = (id: string) =>
    setSelectedPetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addCustomLine = () =>
    setCustomLines(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);

  const removeCustomLine = (i: number) =>
    setCustomLines(prev => prev.filter((_, idx) => idx !== i));

  const updateCustomLine = (i: number, field: keyof CustomLine, value: string | number) =>
    setCustomLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const reset = () => {
    if (!preselectedClientId) { setClientId(''); setClientPets([]); }
    setSelectedPetIds([]);
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

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!clientId) {
      toast({ title: fr ? 'Sélectionnez un client' : 'Select a client', variant: 'destructive' });
      return;
    }
    if (selectedPetIds.length === 0) {
      toast({ title: fr ? 'Sélectionnez au moins un animal' : 'Select at least one pet', variant: 'destructive' });
      return;
    }
    if (!startDate) {
      toast({ title: fr ? 'Date de début requise' : 'Start date required', variant: 'destructive' });
      return;
    }
    if (serviceType === 'BOARDING' && !endDate) {
      toast({ title: fr ? 'Date de fin requise pour la pension' : 'End date required for boarding', variant: 'destructive' });
      return;
    }
    if (serviceType === 'BOARDING' && nights === 0) {
      toast({ title: fr ? 'La durée du séjour doit être d\'au moins 1 nuit' : 'Stay must be at least 1 night', variant: 'destructive' });
      return;
    }

    const dogs = selectedPets.filter(p => p.species === 'DOG');
    const groomingTotal = groomingEnabled ? calcGroomingTotal(dogs, groomingSize, pricing) : 0;
    const taxiAddonTotal =
      (taxiGoEnabled ? pricing.taxi_standard : 0) +
      (taxiReturnEnabled ? pricing.taxi_standard : 0);

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        clientId,
        serviceType,
        petIds: selectedPetIds,
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
          groomingSize: groomingEnabled && dogs.length > 0 ? groomingSize : null,
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

      toast({ title: fr ? 'Réservation créée' : 'Booking created', variant: 'success' });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
      const errorMessages: Record<string, string> = {
        MISSING_CLIENT_ID: fr ? 'Client requis' : 'Client required',
        INVALID_PETS: fr ? 'Animaux invalides' : 'Invalid pets',
        SUNDAY_NOT_ALLOWED: fr ? 'Le taxi n\'est pas disponible le dimanche' : 'Taxi not available on Sundays',
        INVALID_TIME_SLOT: fr ? 'Horaire taxi invalide (10h–17h)' : 'Invalid taxi time slot (10am–5pm)',
      };
      toast({ title: errorMessages[msg] ?? (fr ? 'Erreur inattendue' : 'Unexpected error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal text-white text-xs font-medium rounded-lg hover:bg-charcoal/90 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5" />
        {fr ? 'Créer réservation' : 'Create booking'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* ── Header ── */}
            <div className="sticky top-0 bg-white border-b border-gray-100 flex items-center justify-between px-6 py-4 z-10">
              <h2 className="text-lg font-serif font-bold text-charcoal">
                {fr ? 'Nouvelle réservation (admin)' : 'New booking (admin)'}
              </h2>
              <button onClick={() => setOpen(false)} aria-label={fr ? 'Fermer' : 'Close'} className="text-gray-400 hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-gold-500 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* ── Section 1 : Client & animaux ── */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {fr ? 'Client & animaux' : 'Client & pets'}
                </h3>

                {!preselectedClientId ? (
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-500 block mb-1">Client *</label>
                    <select
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
                    >
                      <option value="">{fr ? '— Sélectionner un client —' : '— Select a client —'}</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mb-3 bg-ivory-50 rounded-lg px-3 py-2 text-sm font-medium text-charcoal">
                    {preselectedClientName}
                  </div>
                )}

                {clientId && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1.5">
                      {fr ? 'Animaux *' : 'Pets *'}
                    </label>
                    {loadingPets ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />{fr ? 'Chargement…' : 'Loading…'}
                      </div>
                    ) : clientPets.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">{fr ? 'Aucun animal' : 'No pets'}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {clientPets.map(pet => (
                          <button
                            key={pet.id}
                            type="button"
                            onClick={() => togglePet(pet.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                              selectedPetIds.includes(pet.id)
                                ? 'bg-gold-50 border-gold-400 text-gold-700'
                                : 'border-gray-200 text-gray-600 hover:border-gold-300'
                            }`}
                          >
                            {pet.name}
                            <span className="text-xs opacity-60 ml-1">
                              ({pet.species === 'DOG' ? (fr ? 'Chien' : 'Dog') : (fr ? 'Chat' : 'Cat')})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ── Section 2 : Service principal ── */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {fr ? 'Service principal' : 'Primary service'}
                </h3>

                {/* Toggle BOARDING / PET_TAXI */}
                <div className="flex gap-2 mb-4">
                  {(['BOARDING', 'PET_TAXI'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setServiceType(st)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        serviceType === st
                          ? 'bg-charcoal text-white border-charcoal'
                          : 'border-gray-200 text-gray-600 hover:border-gold-300'
                      }`}
                    >
                      {st === 'BOARDING' ? (fr ? 'Pension' : 'Boarding') : (fr ? 'Taxi animalier' : 'Pet Taxi')}
                    </button>
                  ))}
                </div>

                {/* ── BOARDING config ── */}
                {serviceType === 'BOARDING' && (
                  <div className="space-y-4">
                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          {fr ? 'Arrivée *' : 'Check-in *'}
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          {fr ? 'Départ *' : 'Check-out *'}
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          min={startDate}
                          className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                        />
                      </div>
                    </div>

                    {/* Nights badge */}
                    {nights > 0 && (
                      <p className="text-xs text-gold-600 font-medium">
                        {nights} {fr ? 'nuit(s)' : 'night(s)'}
                        {nights > 32 && (
                          <span className="ml-2 text-amber-600">
                            {fr ? '— tarif long séjour applicable' : '— long-stay rate applies'}
                          </span>
                        )}
                      </p>
                    )}

                    {/* Toilettage */}
                    <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groomingEnabled}
                          onChange={e => setGroomingEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-gold-500"
                        />
                        <span className="text-sm font-medium text-charcoal">
                          {fr ? 'Toilettage inclus' : 'Include grooming'}
                        </span>
                      </label>
                      {groomingEnabled && selectedPets.filter(p => p.species === 'DOG').length > 0 && (
                        <div className="flex gap-2 ml-6">
                          {(['SMALL', 'LARGE'] as const).map(sz => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setGroomingSize(sz)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                groomingSize === sz
                                  ? 'bg-gold-50 border-gold-400 text-gold-700'
                                  : 'border-gray-200 text-gray-500 hover:border-gold-300'
                              }`}
                            >
                              {sz === 'SMALL'
                                ? `${fr ? 'Petit chien' : 'Small dog'} — ${formatMAD(pricing.grooming_small_dog)}`
                                : `${fr ? 'Grand chien' : 'Large dog'} — ${formatMAD(pricing.grooming_large_dog)}`}
                            </button>
                          ))}
                        </div>
                      )}
                      {groomingEnabled && selectedPets.filter(p => p.species === 'DOG').length === 0 && (
                        <p className="text-xs text-amber-600 ml-6">
                          {fr ? 'Le toilettage s\'applique uniquement aux chiens.' : 'Grooming applies to dogs only.'}
                        </p>
                      )}
                    </div>

                    {/* Taxi addon aller */}
                    <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taxiGoEnabled}
                          onChange={e => setTaxiGoEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-gold-500"
                        />
                        <span className="text-sm font-medium text-charcoal">
                          {fr ? `Pet Taxi — Aller (${formatMAD(pricing.taxi_standard)})` : `Pet Taxi — Drop-off (${formatMAD(pricing.taxi_standard)})`}
                        </span>
                      </label>
                      {taxiGoEnabled && (
                        <div className="grid grid-cols-2 gap-2 ml-6">
                          <input
                            type="date"
                            value={taxiGoDate}
                            onChange={e => setTaxiGoDate(e.target.value)}
                            placeholder={fr ? 'Date aller' : 'Drop-off date'}
                            className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                          <input
                            type="time"
                            value={taxiGoTime}
                            onChange={e => setTaxiGoTime(e.target.value)}
                            min="10:00"
                            max="17:00"
                            className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                          <input
                            type="text"
                            value={taxiGoAddress}
                            onChange={e => setTaxiGoAddress(e.target.value)}
                            placeholder={fr ? 'Adresse de départ' : 'Pick-up address'}
                            className="col-span-2 border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                        </div>
                      )}
                    </div>

                    {/* Taxi addon retour */}
                    <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taxiReturnEnabled}
                          onChange={e => setTaxiReturnEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-gold-500"
                        />
                        <span className="text-sm font-medium text-charcoal">
                          {fr ? `Pet Taxi — Retour (${formatMAD(pricing.taxi_standard)})` : `Pet Taxi — Pick-up (${formatMAD(pricing.taxi_standard)})`}
                        </span>
                      </label>
                      {taxiReturnEnabled && (
                        <div className="grid grid-cols-2 gap-2 ml-6">
                          <input
                            type="date"
                            value={taxiReturnDate}
                            onChange={e => setTaxiReturnDate(e.target.value)}
                            placeholder={fr ? 'Date retour' : 'Return date'}
                            className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                          <input
                            type="time"
                            value={taxiReturnTime}
                            onChange={e => setTaxiReturnTime(e.target.value)}
                            min="10:00"
                            max="17:00"
                            className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                          <input
                            type="text"
                            value={taxiReturnAddress}
                            onChange={e => setTaxiReturnAddress(e.target.value)}
                            placeholder={fr ? 'Adresse de livraison' : 'Drop-off address'}
                            className="col-span-2 border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── PET_TAXI config ── */}
                {serviceType === 'PET_TAXI' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          {fr ? 'Date *' : 'Date *'}
                        </label>
                        <input
                          type="date"
                          value={taxiDate}
                          onChange={e => setTaxiDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          {fr ? 'Heure (10h–17h) *' : 'Time (10am–5pm) *'}
                        </label>
                        <input
                          type="time"
                          value={taxiTime}
                          onChange={e => setTaxiTime(e.target.value)}
                          min="10:00"
                          max="17:00"
                          className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">
                        {fr ? 'Type de taxi' : 'Taxi type'}
                      </label>
                      <div className="flex flex-col gap-1.5">
                        {TAXI_TYPE_LABELS.map(tt => (
                          <button
                            key={tt.value}
                            type="button"
                            onClick={() => setTaxiType(tt.value)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${
                              taxiType === tt.value
                                ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium'
                                : 'border-gray-200 text-gray-600 hover:border-gold-300'
                            }`}
                          >
                            {fr ? tt.labelFr : tt.labelEn}
                            {' '}— {formatMAD(pricing[tt.priceKey])}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ── Section 3 : Lignes additionnelles ── */}
              <section>
                <button
                  type="button"
                  onClick={() => setShowCustomLines(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 hover:text-charcoal transition-colors"
                >
                  {showCustomLines ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {fr ? 'Produits / services additionnels' : 'Extra products / services'}
                  {validCustomLines.length > 0 && (
                    <span className="ml-1 bg-gold-100 text-gold-700 text-xs rounded-full px-1.5 py-0.5">
                      {validCustomLines.length}
                    </span>
                  )}
                </button>

                {showCustomLines && (
                  <div className="space-y-2">
                    {customLines.map((line, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_90px_32px] gap-2 items-center">
                        <input
                          type="text"
                          value={line.description}
                          onChange={e => updateCustomLine(i, 'description', e.target.value)}
                          placeholder={fr ? 'Description…' : 'Description…'}
                          className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                        />
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={e => updateCustomLine(i, 'quantity', parseInt(e.target.value) || 1)}
                          className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 text-center focus:outline-none focus:border-gold-400"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={line.unitPrice === 0 ? '' : line.unitPrice}
                          onChange={e => updateCustomLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                          placeholder="P.U. MAD"
                          className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 text-right focus:outline-none focus:border-gold-400"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomLine(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addCustomLine}
                      className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium py-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {fr ? 'Ajouter une ligne' : 'Add line'}
                    </button>
                  </div>
                )}
              </section>

              {/* ── Section 4 : Récapitulatif ── */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {fr ? 'Récapitulatif facturation' : 'Billing summary'}
                </h3>

                {allLines.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">
                    {fr ? 'Aucune ligne — renseignez les dates et animaux.' : 'No lines yet — fill in dates and pets.'}
                  </p>
                ) : (
                  <div className="border border-ivory-200 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-ivory-50 px-3 py-2 grid grid-cols-[1fr_44px_80px_72px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      <span>{fr ? 'Description' : 'Description'}</span>
                      <span className="text-center">{fr ? 'Qté' : 'Qty'}</span>
                      <span className="text-right">{fr ? 'P.U.' : 'Unit'}</span>
                      <span className="text-right">Total</span>
                    </div>
                    {allLines.map((line, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 grid grid-cols-[1fr_44px_80px_72px] gap-2 border-t border-ivory-100 text-xs items-center"
                      >
                        <span className="text-charcoal">{line.description}</span>
                        <span className="text-center text-gray-500">{line.quantity}</span>
                        <span className="text-right text-gray-500">{formatMAD(line.unitPrice)}</span>
                        <span className="text-right font-medium text-charcoal">{formatMAD(line.total)}</span>
                      </div>
                    ))}
                    {/* Total */}
                    <div className="px-3 py-2.5 border-t border-gold-200/60 bg-ivory-50 flex justify-between items-center">
                      <span className="text-sm font-bold text-charcoal">
                        {fr ? 'Total calculé' : 'Computed total'}
                      </span>
                      <span className="text-base font-bold text-gold-600">{formatMAD(computedTotal)}</span>
                    </div>
                  </div>
                )}

                {/* Override toggle */}
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualOverride}
                      onChange={e => {
                        setManualOverride(e.target.checked);
                        if (e.target.checked) setManualTotal(String(computedTotal));
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-amber-500"
                    />
                    <span className="text-sm text-gray-600">
                      {fr ? 'Forcer le total manuellement' : 'Override total manually'}
                    </span>
                  </label>
                  {manualOverride && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={manualTotal}
                        onChange={e => setManualTotal(e.target.value)}
                        className="flex-1 border border-amber-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-amber-500 bg-amber-50"
                        placeholder="Montant MAD"
                      />
                      <span className="text-sm text-gray-500">MAD</span>
                      <span className="text-xs text-amber-600">
                        {fr ? `(calculé : ${formatMAD(computedTotal)})` : `(computed: ${formatMAD(computedTotal)})`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Final total display */}
                {allLines.length > 0 && (
                  <div className="mt-3 flex justify-between items-center px-3 py-2.5 bg-charcoal text-white rounded-xl">
                    <span className="text-sm font-semibold">
                      {fr ? 'Total réservation' : 'Booking total'}
                      {manualOverride && <span className="text-xs text-amber-300 ml-1.5">(override)</span>}
                    </span>
                    <span className="text-lg font-bold">{formatMAD(finalTotal)}</span>
                  </div>
                )}
              </section>

              {/* ── Notes ── */}
              <section>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  {fr ? 'Notes internes (optionnel)' : 'Internal notes (optional)'}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400 resize-none"
                  placeholder={fr ? 'Instructions particulières…' : 'Special instructions…'}
                />
              </section>

              {/* ── Info banner ── */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                {fr
                  ? 'La réservation sera créée au statut CONFIRMÉ — source MANUELLE (WhatsApp / téléphone / passage direct).'
                  : 'The booking will be created as CONFIRMED — source MANUAL (WhatsApp / phone / walk-in).'}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {fr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {fr ? 'Créer la réservation' : 'Create booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
