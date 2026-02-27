'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, PawPrint, Car, Calendar, Package, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { formatMAD } from '@/lib/utils';

interface Pet {
  id: string;
  name: string;
  species: string; // 'DOG' | 'CAT'
  breed: string | null;
  photoUrl: string | null;
}

type BookingType = 'BOARDING' | 'PET_TAXI';
type TaxiType = 'STANDARD' | 'VET' | 'AIRPORT';
type PetSize = 'SMALL' | 'LARGE';

const TAXI_PRICES = { STANDARD: 150, VET: 300, AIRPORT: 300 };
const GROOMING_PRICES = { SMALL: 100, LARGE: 150 };
const TAXI_ADDON_PRICE = 150;

// Boarding pricing rules
const DOG_PRICE_SINGLE = 120;    // 1 chien, ≤32 nuits
const DOG_PRICE_LONG = 100;      // 1 chien, >32 nuits
const DOG_PRICE_MULTI = 100;     // 2+ chiens par chien
const CAT_PRICE = 70;            // Chat, peu importe

interface PriceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

const isValidTaxiDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() !== 0; // 0 = dimanche
};

export default function NewBookingPage() {
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bookingRef, setBookingRef] = useState('');

  // Form state
  const [bookingType, setBookingType] = useState<BookingType>('BOARDING');
  const [selectedPets, setSelectedPets] = useState<string[]>([]);
  // Boarding
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [groomingPets, setGroomingPets] = useState<Record<string, boolean>>({});
  const [petSizes, setPetSizes] = useState<Record<string, PetSize>>({});
  const [boardingNotes, setBoardingNotes] = useState('');
  // Taxi addon (boarding)
  const [taxiGoEnabled, setTaxiGoEnabled] = useState(false);
  const [taxiGoDate, setTaxiGoDate] = useState('');
  const [taxiGoTime, setTaxiGoTime] = useState('');
  const [taxiGoAddress, setTaxiGoAddress] = useState('');
  const [taxiReturnEnabled, setTaxiReturnEnabled] = useState(false);
  const [taxiReturnDate, setTaxiReturnDate] = useState('');
  const [taxiReturnTime, setTaxiReturnTime] = useState('');
  const [taxiReturnAddress, setTaxiReturnAddress] = useState('');
  // Taxi standalone
  const [taxiType, setTaxiType] = useState<TaxiType>('STANDARD');
  const [taxiDate, setTaxiDate] = useState('');
  const [taxiTime, setTaxiTime] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [taxiNotes, setTaxiNotes] = useState('');

  const t = {
    fr: {
      title: 'Nouvelle réservation',
      steps: ['Type', 'Animaux', 'Détails', 'Récapitulatif', 'Confirmé'],
      stepTitles: ['Quel service ?', 'Choisir les animaux', 'Détails', 'Récapitulatif', 'Réservation confirmée !'],
      boarding: 'Pension',
      boardingDesc: 'Hébergement pour votre animal avec attention personnalisée',
      taxi: 'Taxi Animalier',
      taxiDesc: 'Transport sécurisé à Marrakech (vétérinaire, aéroport, ville)',
      next: 'Suivant',
      back: 'Retour',
      selectPets: 'Sélectionner vos animaux',
      noPets: 'Vous n\'avez pas encore d\'animaux.',
      addPet: 'Ajouter un animal',
      checkIn: 'Date d\'arrivée',
      checkOut: 'Date de départ',
      grooming: 'Grooming (chiens uniquement)',
      groomingPrice: '+100/150 MAD',
      petSize: 'Taille',
      small: 'Petit (<10kg)',
      large: 'Grand (>10kg)',
      taxiAddonTitle: 'Option Pet Taxi',
      taxiAddonDesc: 'Transport aller et/ou retour (lun-sam, 10h-17h) — 150 MAD/trajet',
      taxiGo: 'Aller — dépôt à la pension',
      taxiReturn: 'Retour — récupération à la pension',
      taxiGoDate: 'Date de dépôt',
      taxiReturnDate: 'Date de récupération',
      taxiTime: 'Heure',
      taxiAddress: 'Adresse',
      taxiAddressPlaceholder: 'Votre adresse, Marrakech',
      sundayNotAllowed: 'Le dimanche n\'est pas disponible',
      invalidTime: 'Horaire disponible : 10h - 17h',
      taxiTypeLabel: 'Type de trajet',
      standard: 'Standard (ville)',
      vet: 'Vétérinaire',
      airport: 'Aéroport',
      taxiDateLabel: 'Date du trajet',
      taxiTimeLabel: 'Heure',
      pickup: 'Adresse de départ',
      dropoff: 'Adresse d\'arrivée',
      notes: 'Notes particulières',
      notesPlaceholder: 'Allergies, médicaments, préférences...',
      summary: 'Récapitulatif',
      type: 'Type',
      animals: 'Animaux',
      dates: 'Dates',
      duration: 'Durée',
      nights: 'nuits',
      night: 'nuit',
      breakdown: 'Détail du tarif',
      total: 'Total estimé',
      confirm: 'Confirmer la réservation',
      confirmedTitle: 'Réservation envoyée !',
      confirmedDesc: 'Votre demande a été transmise à notre équipe. Vous recevrez une confirmation par email sous 24h.',
      ref: 'Référence',
      viewHistory: 'Voir mes réservations',
      newBooking: 'Nouvelle réservation',
      groomingNote: 'Le grooming est disponible uniquement pour les chiens.',
      selectAtLeastOne: 'Sélectionnez au moins un animal',
      fillAllFields: 'Veuillez remplir tous les champs obligatoires',
      checkOutAfterCheckIn: 'La date de départ doit être après la date d\'arrivée',
    },
    en: {
      title: 'New booking',
      steps: ['Type', 'Pets', 'Details', 'Summary', 'Confirmed'],
      stepTitles: ['Which service?', 'Choose pets', 'Details', 'Summary', 'Booking confirmed!'],
      boarding: 'Boarding',
      boardingDesc: 'Accommodation for your pet with personalized attention',
      taxi: 'Pet Taxi',
      taxiDesc: 'Safe transport in Marrakech (vet, airport, city)',
      next: 'Next',
      back: 'Back',
      selectPets: 'Select your pets',
      noPets: 'You don\'t have any pets yet.',
      addPet: 'Add a pet',
      checkIn: 'Check-in date',
      checkOut: 'Check-out date',
      grooming: 'Grooming (dogs only)',
      groomingPrice: '+100/150 MAD',
      petSize: 'Size',
      small: 'Small (<10kg)',
      large: 'Large (>10kg)',
      taxiAddonTitle: 'Pet Taxi Option',
      taxiAddonDesc: 'Drop-off and/or pick-up transport (Mon-Sat, 10am-5pm) — 150 MAD/trip',
      taxiGo: 'Drop-off at the boarding',
      taxiReturn: 'Pick-up from the boarding',
      taxiGoDate: 'Drop-off date',
      taxiReturnDate: 'Pick-up date',
      taxiTime: 'Time',
      taxiAddress: 'Address',
      taxiAddressPlaceholder: 'Your address, Marrakech',
      sundayNotAllowed: 'Sunday is not available',
      invalidTime: 'Available hours: 10am - 5pm',
      taxiTypeLabel: 'Trip type',
      standard: 'Standard (city)',
      vet: 'Veterinarian',
      airport: 'Airport',
      taxiDateLabel: 'Trip date',
      taxiTimeLabel: 'Time',
      pickup: 'Pickup address',
      dropoff: 'Dropoff address',
      notes: 'Special notes',
      notesPlaceholder: 'Allergies, medications, preferences...',
      summary: 'Summary',
      type: 'Type',
      animals: 'Pets',
      dates: 'Dates',
      duration: 'Duration',
      nights: 'nights',
      night: 'night',
      breakdown: 'Price breakdown',
      total: 'Estimated total',
      confirm: 'Confirm booking',
      confirmedTitle: 'Booking sent!',
      confirmedDesc: 'Your request has been sent to our team. You will receive a confirmation by email within 24 hours.',
      ref: 'Reference',
      viewHistory: 'View my bookings',
      newBooking: 'New booking',
      groomingNote: 'Grooming is available for dogs only.',
      selectAtLeastOne: 'Select at least one pet',
      fillAllFields: 'Please fill in all required fields',
      checkOutAfterCheckIn: 'Check-out must be after check-in',
    },
  };

  const l = t[locale as keyof typeof t] || t.fr;

  useEffect(() => {
    fetch('/api/pets')
      .then(r => r.json())
      .then(data => { setPets(data); setLoadingPets(false); })
      .catch(() => setLoadingPets(false));
  }, []);

  const togglePet = (id: string) => {
    setSelectedPets(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const calculateNights = () => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const selectedPetObjects = pets.filter(p => selectedPets.includes(p.id));
  const dogPets = selectedPetObjects.filter(p => p.species === 'DOG');
  const catPets = selectedPetObjects.filter(p => p.species === 'CAT');

  const getPriceBreakdown = (): { items: PriceItem[], total: number } => {
    if (bookingType === 'PET_TAXI') {
      const price = TAXI_PRICES[taxiType];
      const label = taxiType === 'STANDARD' ? (locale === 'fr' ? 'Pet Taxi — Standard' : 'Pet Taxi — Standard')
        : taxiType === 'VET' ? (locale === 'fr' ? 'Pet Taxi — Vétérinaire' : 'Pet Taxi — Vet')
        : (locale === 'fr' ? 'Pet Taxi — Aéroport' : 'Pet Taxi — Airport');
      return { items: [{ description: label, quantity: 1, unitPrice: price, total: price }], total: price };
    }

    const nights = calculateNights();
    const items: PriceItem[] = [];

    // Dogs
    if (dogPets.length === 1) {
      const pricePerNight = nights > 32 ? DOG_PRICE_LONG : DOG_PRICE_SINGLE;
      items.push({
        description: locale === 'fr' ? `Pension ${dogPets[0].name} (chien)` : `Boarding ${dogPets[0].name} (dog)`,
        quantity: nights,
        unitPrice: pricePerNight,
        total: nights * pricePerNight,
      });
    } else if (dogPets.length > 1) {
      dogPets.forEach(dog => {
        items.push({
          description: locale === 'fr' ? `Pension ${dog.name} (chien)` : `Boarding ${dog.name} (dog)`,
          quantity: nights,
          unitPrice: DOG_PRICE_MULTI,
          total: nights * DOG_PRICE_MULTI,
        });
      });
    }

    // Cats
    catPets.forEach(cat => {
      items.push({
        description: locale === 'fr' ? `Pension ${cat.name} (chat)` : `Boarding ${cat.name} (cat)`,
        quantity: nights,
        unitPrice: CAT_PRICE,
        total: nights * CAT_PRICE,
      });
    });

    // Grooming (dogs only)
    dogPets.forEach(dog => {
      if (groomingPets[dog.id]) {
        const groomPrice = petSizes[dog.id] === 'LARGE' ? GROOMING_PRICES.LARGE : GROOMING_PRICES.SMALL;
        const sizeLabel = petSizes[dog.id] === 'LARGE' ? (locale === 'fr' ? 'grand' : 'large') : (locale === 'fr' ? 'petit' : 'small');
        items.push({
          description: `Grooming ${dog.name} (${sizeLabel})`,
          quantity: 1,
          unitPrice: groomPrice,
          total: groomPrice,
        });
      }
    });

    // Taxi addon
    if (taxiGoEnabled) {
      items.push({
        description: locale === 'fr' ? 'Pet Taxi — Aller' : 'Pet Taxi — Drop-off',
        quantity: 1,
        unitPrice: TAXI_ADDON_PRICE,
        total: TAXI_ADDON_PRICE,
      });
    }
    if (taxiReturnEnabled) {
      items.push({
        description: locale === 'fr' ? 'Pet Taxi — Retour' : 'Pet Taxi — Pick-up',
        quantity: 1,
        unitPrice: TAXI_ADDON_PRICE,
        total: TAXI_ADDON_PRICE,
      });
    }

    return { items, total: items.reduce((sum, item) => sum + item.total, 0) };
  };

  const validateStep = () => {
    if (step === 2 && selectedPets.length === 0) {
      toast({ title: l.selectAtLeastOne, variant: 'destructive' });
      return false;
    }
    if (step === 3 && bookingType === 'BOARDING') {
      if (!checkIn || !checkOut) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
      if (new Date(checkOut) <= new Date(checkIn)) { toast({ title: l.checkOutAfterCheckIn, variant: 'destructive' }); return false; }
      if (taxiGoEnabled) {
        if (!taxiGoDate || !taxiGoTime || !taxiGoAddress) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
        if (!isValidTaxiDate(taxiGoDate)) { toast({ title: l.sundayNotAllowed, variant: 'destructive' }); return false; }
      }
      if (taxiReturnEnabled) {
        if (!taxiReturnDate || !taxiReturnTime || !taxiReturnAddress) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
        if (!isValidTaxiDate(taxiReturnDate)) { toast({ title: l.sundayNotAllowed, variant: 'destructive' }); return false; }
      }
    }
    if (step === 3 && bookingType === 'PET_TAXI') {
      if (!taxiDate || !taxiTime || !pickupAddress || !dropoffAddress) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { total } = getPriceBreakdown();
      const body: Record<string, unknown> = {
        serviceType: bookingType,
        petIds: selectedPets,
        totalPrice: total,
      };
      if (bookingType === 'BOARDING') {
        body.startDate = new Date(checkIn).toISOString();
        body.endDate = new Date(checkOut).toISOString();
        body.notes = boardingNotes;
        const groomingDog = dogPets.find(d => groomingPets[d.id]);
        body.includeGrooming = !!groomingDog;
        body.groomingSize = groomingDog ? (petSizes[groomingDog.id] || 'SMALL') : null;
        body.groomingPrice = groomingDog ? (petSizes[groomingDog.id] === 'LARGE' ? GROOMING_PRICES.LARGE : GROOMING_PRICES.SMALL) : 0;
        body.pricePerNight = 0;
        // Taxi addon
        body.taxiGoEnabled = taxiGoEnabled;
        body.taxiGoDate = taxiGoEnabled ? taxiGoDate : null;
        body.taxiGoTime = taxiGoEnabled ? taxiGoTime : null;
        body.taxiGoAddress = taxiGoEnabled ? taxiGoAddress : null;
        body.taxiReturnEnabled = taxiReturnEnabled;
        body.taxiReturnDate = taxiReturnEnabled ? taxiReturnDate : null;
        body.taxiReturnTime = taxiReturnEnabled ? taxiReturnTime : null;
        body.taxiReturnAddress = taxiReturnEnabled ? taxiReturnAddress : null;
        body.taxiAddonPrice = (taxiGoEnabled ? TAXI_ADDON_PRICE : 0) + (taxiReturnEnabled ? TAXI_ADDON_PRICE : 0);
      } else {
        const dateTime = new Date(`${taxiDate}T${taxiTime}`);
        body.startDate = dateTime.toISOString();
        body.taxiType = taxiType;
        const notes = [taxiNotes, pickupAddress && `Départ: ${pickupAddress}`, dropoffAddress && `Arrivée: ${dropoffAddress}`].filter(Boolean).join(' | ');
        body.notes = notes || undefined;
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setBookingRef(data.bookingRef || data.id);
      setStep(5);
    } catch {
      toast({ title: locale === 'fr' ? 'Erreur lors de la réservation' : 'Booking error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const nights = calculateNights();
  const { items: priceItems, total } = getPriceBreakdown();
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {step < 5 && (
          <Link href={`/${locale}/client/dashboard`} className="text-charcoal/50 hover:text-charcoal">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
      </div>

      {/* Progress steps */}
      {step < 5 && (
        <div className="flex items-center mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 transition-colors ${
                step > s ? 'bg-gold-500 text-white' : step === s ? 'bg-charcoal text-white' : 'bg-ivory-200 text-gray-400'
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              <span className="ml-2 text-xs text-gray-500 hidden sm:block">{l.steps[s - 1]}</span>
              {s < 4 && <div className={`flex-1 h-px mx-2 ${step > s ? 'bg-gold-400' : 'bg-ivory-200'}`} />}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-6">{l.stepTitles[step - 1]}</h2>

        {/* Step 1: Type */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['BOARDING', l.boarding, l.boardingDesc, Package], ['PET_TAXI', l.taxi, l.taxiDesc, Car]] as const).map(([type, label, desc, Icon]) => (
              <button
                key={type}
                onClick={() => setBookingType(type as BookingType)}
                className={`p-5 rounded-xl border-2 text-left transition-all ${
                  bookingType === type ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
                }`}
              >
                <Icon className={`h-8 w-8 mb-3 ${bookingType === type ? 'text-gold-500' : 'text-gray-400'}`} />
                <div className="font-semibold text-charcoal">{label}</div>
                <div className="text-sm text-gray-500 mt-1">{desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Pets */}
        {step === 2 && (
          <div>
            {loadingPets ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold-500" /></div>
            ) : pets.length === 0 ? (
              <div className="text-center py-8">
                <PawPrint className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 mb-4">{l.noPets}</p>
                <Link href={`/${locale}/client/pets/new`}>
                  <Button variant="outline">{l.addPet}</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-4">{l.selectPets}</p>
                {pets.map(pet => (
                  <button
                    key={pet.id}
                    onClick={() => togglePet(pet.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selectedPets.includes(pet.id) ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {pet.photoUrl ? (
                        <img src={pet.photoUrl} alt={pet.name} className="w-12 h-12 object-cover" />
                      ) : (
                        <PawPrint className="h-6 w-6 text-gold-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-charcoal">{pet.name}</div>
                      <div className="text-sm text-gray-500">{pet.breed || pet.species}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPets.includes(pet.id) ? 'border-gold-500 bg-gold-500' : 'border-gray-300'
                    }`}>
                      {selectedPets.includes(pet.id) && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Boarding Details */}
        {step === 3 && bookingType === 'BOARDING' && (
          <div className="space-y-5">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="checkin">{l.checkIn} *</Label>
                <Input id="checkin" type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} min={today} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="checkout">{l.checkOut} *</Label>
                <Input id="checkout" type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={checkIn || today} className="mt-1" />
              </div>
            </div>

            {/* Grooming — dogs only */}
            {dogPets.length > 0 && (
              <div>
                <Label>{l.grooming} <span className="text-gold-600 font-medium">{l.groomingPrice}</span></Label>
                <p className="text-xs text-gray-500 mb-3">{l.groomingNote}</p>
                <div className="space-y-2">
                  {dogPets.map(pet => (
                    <div key={pet.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`groom-${pet.id}`}
                          checked={groomingPets[pet.id] || false}
                          onChange={e => setGroomingPets(p => ({ ...p, [pet.id]: e.target.checked }))}
                          className="w-4 h-4 accent-gold-500"
                        />
                        <label htmlFor={`groom-${pet.id}`} className="font-medium text-sm text-charcoal cursor-pointer">{pet.name}</label>
                      </div>
                      {groomingPets[pet.id] && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{l.petSize}</Label>
                          <select
                            value={petSizes[pet.id] || 'SMALL'}
                            onChange={e => setPetSizes(p => ({ ...p, [pet.id]: e.target.value as PetSize }))}
                            className="text-xs border border-ivory-300 rounded px-2 py-1 bg-white"
                          >
                            <option value="SMALL">{l.small} (+{GROOMING_PRICES.SMALL} MAD)</option>
                            <option value="LARGE">{l.large} (+{GROOMING_PRICES.LARGE} MAD)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pet Taxi Addon */}
            <div className="border border-ivory-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Car className="h-4 w-4 text-gold-500" />
                <span className="font-medium text-sm text-charcoal">{l.taxiAddonTitle}</span>
              </div>
              <p className="text-xs text-gray-500">{l.taxiAddonDesc}</p>

              {/* Aller */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="taxi-go"
                    checked={taxiGoEnabled}
                    onChange={e => setTaxiGoEnabled(e.target.checked)}
                    className="w-4 h-4 accent-gold-500"
                  />
                  <label htmlFor="taxi-go" className="text-sm font-medium text-charcoal cursor-pointer">
                    {l.taxiGo} <span className="text-gold-600">+{TAXI_ADDON_PRICE} MAD</span>
                  </label>
                </div>
                {taxiGoEnabled && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <Label className="text-xs">{l.taxiGoDate} *</Label>
                      <Input
                        type="date"
                        value={taxiGoDate}
                        onChange={e => {
                          const val = e.target.value;
                          setTaxiGoDate(val);
                          if (val && !isValidTaxiDate(val)) toast({ title: l.sundayNotAllowed, variant: 'destructive' });
                        }}
                        min={today}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{l.taxiTime} * (10h-17h)</Label>
                      <Input
                        type="time"
                        value={taxiGoTime}
                        onChange={e => setTaxiGoTime(e.target.value)}
                        min="10:00"
                        max="17:00"
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{l.taxiAddress} *</Label>
                      <Input
                        value={taxiGoAddress}
                        onChange={e => setTaxiGoAddress(e.target.value)}
                        placeholder={l.taxiAddressPlaceholder}
                        className="mt-1 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Retour */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="taxi-return"
                    checked={taxiReturnEnabled}
                    onChange={e => setTaxiReturnEnabled(e.target.checked)}
                    className="w-4 h-4 accent-gold-500"
                  />
                  <label htmlFor="taxi-return" className="text-sm font-medium text-charcoal cursor-pointer">
                    {l.taxiReturn} <span className="text-gold-600">+{TAXI_ADDON_PRICE} MAD</span>
                  </label>
                </div>
                {taxiReturnEnabled && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <Label className="text-xs">{l.taxiReturnDate} *</Label>
                      <Input
                        type="date"
                        value={taxiReturnDate}
                        onChange={e => {
                          const val = e.target.value;
                          setTaxiReturnDate(val);
                          if (val && !isValidTaxiDate(val)) toast({ title: l.sundayNotAllowed, variant: 'destructive' });
                        }}
                        min={today}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{l.taxiTime} * (10h-17h)</Label>
                      <Input
                        type="time"
                        value={taxiReturnTime}
                        onChange={e => setTaxiReturnTime(e.target.value)}
                        min="10:00"
                        max="17:00"
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{l.taxiAddress} *</Label>
                      <Input
                        value={taxiReturnAddress}
                        onChange={e => setTaxiReturnAddress(e.target.value)}
                        placeholder={l.taxiAddressPlaceholder}
                        className="mt-1 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="notes">{l.notes}</Label>
              <Textarea id="notes" value={boardingNotes} onChange={e => setBoardingNotes(e.target.value)} placeholder={l.notesPlaceholder} rows={3} className="mt-1" />
            </div>
          </div>
        )}

        {/* Step 3: Taxi Details */}
        {step === 3 && bookingType === 'PET_TAXI' && (
          <div className="space-y-5">
            <div>
              <Label>{l.taxiTypeLabel}</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {([['STANDARD', l.standard, TAXI_PRICES.STANDARD], ['VET', l.vet, TAXI_PRICES.VET], ['AIRPORT', l.airport, TAXI_PRICES.AIRPORT]] as const).map(([type, label, price]) => (
                  <button
                    key={type}
                    onClick={() => setTaxiType(type as TaxiType)}
                    className={`p-3 rounded-lg border-2 text-center text-sm transition-all ${
                      taxiType === type ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
                    }`}
                  >
                    <div className="font-medium text-charcoal">{label}</div>
                    <div className="text-gold-600 font-semibold">{formatMAD(price)}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tdate">{l.taxiDateLabel} *</Label>
                <Input id="tdate" type="date" value={taxiDate} onChange={e => setTaxiDate(e.target.value)} min={today} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ttime">{l.taxiTimeLabel} *</Label>
                <Input id="ttime" type="time" value={taxiTime} onChange={e => setTaxiTime(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="pickup">{l.pickup} *</Label>
              <Input id="pickup" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Gueliz, Marrakech" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="dropoff">{l.dropoff} *</Label>
              <Input id="dropoff" value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)} placeholder="Aéroport Menara" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tnotes">{l.notes}</Label>
              <Textarea id="tnotes" value={taxiNotes} onChange={e => setTaxiNotes(e.target.value)} placeholder={l.notesPlaceholder} rows={3} className="mt-1" />
            </div>
          </div>
        )}

        {/* Step 4: Summary */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-ivory-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{l.type}</span>
                <Badge variant="outline">{bookingType !== 'PET_TAXI' ? l.boarding : l.taxi}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{l.animals}</span>
                <span className="font-medium text-charcoal">{selectedPetObjects.map(p => p.name).join(', ')}</span>
              </div>
              {bookingType === 'BOARDING' ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{l.dates}</span>
                    <span className="font-medium text-charcoal">
                      {new Date(checkIn).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US')} → {new Date(checkOut).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US')}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{l.duration}</span>
                    <span className="font-medium text-charcoal">{nights} {nights > 1 ? l.nights : l.night}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{l.taxiTypeLabel}</span>
                    <span className="font-medium text-charcoal">{taxiType === 'STANDARD' ? l.standard : taxiType === 'VET' ? l.vet : l.airport}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{l.pickup}</span>
                    <span className="font-medium text-charcoal text-right max-w-[60%]">{pickupAddress}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{l.dropoff}</span>
                    <span className="font-medium text-charcoal text-right max-w-[60%]">{dropoffAddress}</span>
                  </div>
                </>
              )}

              {/* Price breakdown */}
              {priceItems.length > 0 && (
                <>
                  <div className="border-t border-ivory-200 pt-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{l.breakdown}</p>
                    <div className="space-y-1.5">
                      {priceItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {item.description}
                            {item.quantity > 1 && <span className="text-gray-400"> × {item.quantity} × {formatMAD(item.unitPrice)}</span>}
                          </span>
                          <span className="font-medium text-charcoal">{formatMAD(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-ivory-200 pt-3 flex justify-between">
                    <span className="font-semibold text-charcoal">{l.total}</span>
                    <span className="font-bold text-lg text-gold-600">{formatMAD(total)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{locale === 'fr' ? 'Le montant final sera confirmé par notre équipe.' : 'The final amount will be confirmed by our team.'}</span>
            </div>
          </div>
        )}

        {/* Step 5: Confirmed */}
        {step === 5 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-charcoal mb-2">{l.confirmedTitle}</h3>
            <p className="text-gray-500 mb-4">{l.confirmedDesc}</p>
            {bookingRef && (
              <div className="inline-block bg-ivory-100 px-4 py-2 rounded-lg text-sm">
                <span className="text-gray-500">{l.ref} : </span>
                <span className="font-mono font-bold text-charcoal">{bookingRef}</span>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <Link href={`/${locale}/client/history`} className="flex-1">
                <Button variant="outline" className="w-full">{l.viewHistory}</Button>
              </Link>
              <Button className="flex-1" onClick={() => { setStep(1); setSelectedPets([]); setCheckIn(''); setCheckOut(''); setBookingRef(''); setTaxiGoEnabled(false); setTaxiReturnEnabled(false); }}>
                {l.newBooking}
              </Button>
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {l.back}
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={handleNext} className="flex-1">
                {l.next}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {l.confirm}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
