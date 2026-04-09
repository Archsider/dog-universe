'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface Pet {
  id: string;
  name: string;
  species: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
}

interface Props {
  locale: string;
  /** Pre-fill a specific client (from client profile page). Also hides client selector. */
  preselectedClientId?: string;
  preselectedClientName?: string;
  preselectedPets?: Pet[];
  /** List of all clients for the selector (omit if preselectedClientId is set) */
  clients?: Client[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const SERVICE_TYPES = [
  { value: 'BOARDING', fr: 'Pension', en: 'Boarding' },
  { value: 'PET_TAXI', fr: 'Taxi animalier', en: 'Pet Taxi' },
] as const;

const TAXI_TYPES = [
  { value: 'STANDARD', fr: 'Standard', en: 'Standard' },
  { value: 'VET', fr: 'Vétérinaire', en: 'Vet' },
  { value: 'AIRPORT', fr: 'Aéroport', en: 'Airport' },
] as const;

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

  // Client + pets
  const [clientId, setClientId] = useState(preselectedClientId ?? '');
  const [clientPets, setClientPets] = useState<Pet[]>(preselectedPets ?? []);
  const [loadingPets, setLoadingPets] = useState(false);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  // Service
  const [serviceType, setServiceType] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [totalPrice, setTotalPrice] = useState('');
  const [notes, setNotes] = useState('');

  // Taxi
  const [taxiType, setTaxiType] = useState<'STANDARD' | 'VET' | 'AIRPORT'>('STANDARD');

  // Boarding
  const [includeGrooming, setIncludeGrooming] = useState(false);
  const [groomingPrice, setGroomingPrice] = useState('');

  // Load pets when client changes (only when no preselected client)
  useEffect(() => {
    if (!clientId || preselectedClientId) return;
    setLoadingPets(true);
    setSelectedPetIds([]);
    fetch(`/api/admin/clients/${clientId}`)
      .then(r => r.json())
      .then(data => {
        const pets = (data.pets ?? []).map((p: Pet) => ({ id: p.id, name: p.name, species: p.species }));
        setClientPets(pets);
      })
      .catch(() => setClientPets([]))
      .finally(() => setLoadingPets(false));
  }, [clientId, preselectedClientId]);

  const togglePet = (petId: string) => {
    setSelectedPetIds(prev =>
      prev.includes(petId) ? prev.filter(id => id !== petId) : [...prev, petId]
    );
  };

  const reset = () => {
    if (!preselectedClientId) {
      setClientId('');
      setClientPets([]);
    }
    setSelectedPetIds([]);
    setServiceType('BOARDING');
    setStartDate(todayIso());
    setEndDate('');
    setArrivalTime('10:00');
    setTotalPrice('');
    setNotes('');
    setTaxiType('STANDARD');
    setIncludeGrooming(false);
    setGroomingPrice('');
  };

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

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        clientId,
        serviceType,
        petIds: selectedPetIds,
        startDate,
        endDate: endDate || null,
        arrivalTime: serviceType === 'PET_TAXI' ? arrivalTime : null,
        notes: notes.trim() || null,
        totalPrice: totalPrice ? parseFloat(totalPrice) : 0,
        source: 'MANUAL',
      };

      if (serviceType === 'BOARDING') {
        body.includeGrooming = includeGrooming;
        body.groomingPrice = groomingPrice ? parseFloat(groomingPrice) : 0;
      } else {
        body.taxiType = taxiType;
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
      toast({ title: errorMessages[msg] ?? (fr ? 'Erreur' : 'Error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

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
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-serif font-bold text-charcoal">
                {fr ? 'Nouvelle réservation (admin)' : 'New booking (admin)'}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-charcoal">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Client selector (hidden if preselected) */}
              {!preselectedClientId ? (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {fr ? 'Client *' : 'Client *'}
                  </label>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
                  >
                    <option value="">{fr ? '— Sélectionner —' : '— Select —'}</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-ivory-50 rounded-lg px-3 py-2 text-sm text-charcoal font-medium">
                  {fr ? 'Client : ' : 'Client: '}{preselectedClientName}
                </div>
              )}

              {/* Pet selection */}
              {clientId && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {fr ? 'Animaux *' : 'Pets *'}
                  </label>
                  {loadingPets ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {fr ? 'Chargement…' : 'Loading…'}
                    </div>
                  ) : clientPets.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      {fr ? 'Aucun animal pour ce client' : 'No pets for this client'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {clientPets.map(pet => (
                        <button
                          key={pet.id}
                          onClick={() => togglePet(pet.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                            selectedPetIds.includes(pet.id)
                              ? 'bg-gold-50 border-gold-400 text-gold-700'
                              : 'border-gray-200 text-gray-600 hover:border-gold-300'
                          }`}
                        >
                          {pet.name} <span className="text-xs opacity-60">({pet.species === 'DOG' ? (fr ? 'Chien' : 'Dog') : (fr ? 'Chat' : 'Cat')})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Service type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {fr ? 'Type de service *' : 'Service type *'}
                </label>
                <div className="flex gap-2">
                  {SERVICE_TYPES.map(st => (
                    <button
                      key={st.value}
                      onClick={() => setServiceType(st.value)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        serviceType === st.value
                          ? 'bg-charcoal text-white border-charcoal'
                          : 'border-gray-200 text-gray-600 hover:border-gold-300'
                      }`}
                    >
                      {fr ? st.fr : st.en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {serviceType === 'BOARDING' ? (fr ? 'Arrivée *' : 'Check-in *') : (fr ? 'Date *' : 'Date *')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                  />
                </div>
                {serviceType === 'BOARDING' ? (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      {fr ? 'Départ *' : 'Check-out *'}
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      min={startDate}
                      className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      {fr ? 'Heure (10h–17h) *' : 'Time (10am–5pm) *'}
                    </label>
                    <input
                      type="time"
                      value={arrivalTime}
                      min="10:00"
                      max="17:00"
                      onChange={e => setArrivalTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                    />
                  </div>
                )}
              </div>

              {/* Taxi type */}
              {serviceType === 'PET_TAXI' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {fr ? 'Type de taxi' : 'Taxi type'}
                  </label>
                  <div className="flex gap-2">
                    {TAXI_TYPES.map(tt => (
                      <button
                        key={tt.value}
                        onClick={() => setTaxiType(tt.value)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          taxiType === tt.value
                            ? 'bg-gold-50 border-gold-400 text-gold-700'
                            : 'border-gray-200 text-gray-600 hover:border-gold-300'
                        }`}
                      >
                        {fr ? tt.fr : tt.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Boarding: grooming option */}
              {serviceType === 'BOARDING' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeGrooming}
                      onChange={e => setIncludeGrooming(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-charcoal">
                      {fr ? 'Inclure le toilettage' : 'Include grooming'}
                    </span>
                  </label>
                  {includeGrooming && (
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={groomingPrice}
                      onChange={e => setGroomingPrice(e.target.value)}
                      placeholder={fr ? 'Prix toilettage MAD' : 'Grooming price MAD'}
                      className="flex-1 border border-gray-200 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:border-gold-400"
                    />
                  )}
                </div>
              )}

              {/* Total price */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {fr ? 'Prix total (MAD)' : 'Total price (MAD)'}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={totalPrice}
                  onChange={e => setTotalPrice(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {fr ? 'Laissez 0 pour calculer automatiquement selon les tarifs.' : 'Leave 0 to auto-calculate from settings.'}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {fr ? 'Notes (optionnel)' : 'Notes (optional)'}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 resize-none"
                  placeholder={fr ? 'Instructions particulières…' : 'Special instructions…'}
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                {fr
                  ? 'La réservation sera créée au statut CONFIRMÉ et marquée comme saisie manuellement (WhatsApp / téléphone / passage direct).'
                  : 'The booking will be created as CONFIRMED and marked as manually entered (WhatsApp / phone / walk-in).'}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
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
