'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { type BookingType, type Pet } from './_lib/types';
import { getWizardLabels, pick } from './_lib/i18n';
import { isValidTaxiDate, isValidTaxiTime } from './_lib/validation';
import { calculateNights, getPriceBreakdown } from './_lib/pricing';
import { useFormState } from './_lib/use-form-state';
import { useCapacityCheck } from './_lib/use-capacity-check';
import { buildBookingPayload } from './_lib/submit-payload';
import { ServiceTypeStep } from './_components/ServiceTypeStep';
import { PetsStep } from './_components/PetsStep';
import { BoardingDetailsStep } from './_components/BoardingDetailsStep';
import { TaxiDetailsStep } from './_components/TaxiDetailsStep';
import { SummaryStep } from './_components/SummaryStep';
import { ConfirmedStep } from './_components/ConfirmedStep';
import { WizardHeader, WizardProgress, WizardNav } from './_components/WizardChrome';

export default function NewBookingPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const l = getWizardLabels(locale);

  // Prefill params from ?petIds=...&serviceType=...&prefill=1
  const prefillPetIds = searchParams.get('petIds') ?? '';
  const prefillServiceType = searchParams.get('serviceType') as BookingType | null;
  const isPrefill = searchParams.get('prefill') === '1';

  // Step stored in URL (?step=N) — enables back-button navigation between wizard steps.
  const stepParam = parseInt(searchParams.get('step') ?? '1', 10);
  const step = stepParam >= 1 && stepParam <= 5 ? stepParam : 1;
  const setStep = useCallback(
    (nextStep: number | ((prev: number) => number)) => {
      const next = typeof nextStep === 'function' ? nextStep(step) : nextStep;
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', String(next));
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, step],
  );

  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [petsReloadKey, setPetsReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [bookingType, setBookingType] = useState<BookingType>(
    prefillServiceType === 'BOARDING' || prefillServiceType === 'PET_TAXI' ? prefillServiceType : 'BOARDING',
  );

  const form = useFormState(prefillPetIds ? prefillPetIds.split(',').filter(Boolean) : []);
  const { selectedPets, setSelectedPets, boarding, taxiGo, taxiReturn, taxi } = form;

  const selectedPetObjects = pets.filter(p => selectedPets.includes(p.id));
  const dogPets = selectedPetObjects.filter(p => p.species === 'DOG');
  const catPets = selectedPetObjects.filter(p => p.species === 'CAT');

  const capacityStatus = useCapacityCheck(bookingType, boarding.checkIn, boarding.checkOut, dogPets.length, catPets.length);

  // Track whether we've already reconciled the prefill pet IDs against loaded pets
  const prefillSyncedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoadingPets(true);
    setPetsError(null);
    fetch('/api/pets')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error('Invalid response');
        setPets(data as Pet[]);
        setLoadingPets(false);
        if (isPrefill && prefillPetIds && !prefillSyncedRef.current) {
          prefillSyncedRef.current = true;
          const validIds = (data as Pet[]).map(p => p.id);
          const reconciled = prefillPetIds.split(',').filter(Boolean).filter(id => validIds.includes(id));
          if (reconciled.length > 0) setSelectedPets(reconciled);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPetsError(l.petsLoadError);
        setLoadingPets(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petsReloadKey]);

  const togglePet = (id: string) => {
    setSelectedPets(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const validateStep = (): boolean => {
    if (step === 2 && selectedPets.length === 0) {
      toast({ title: l.selectAtLeastOne, variant: 'destructive' });
      return false;
    }
    if (step === 3 && bookingType === 'BOARDING') {
      if (!boarding.checkIn || !boarding.checkOut) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
      if (new Date(boarding.checkOut) <= new Date(boarding.checkIn)) { toast({ title: l.checkOutAfterCheckIn, variant: 'destructive' }); return false; }
      if (capacityStatus === 'full') {
        toast({
          title: pick(
            locale,
            'Pension complète sur ces dates — choisissez une autre période.',
            'Boarding is full on these dates — please pick another period.',
            'الدار ممتلئة في هذه التواريخ — اختر فترة أخرى.',
          ),
          variant: 'destructive',
        });
        return false;
      }
      for (const addon of [taxiGo, taxiReturn]) {
        if (!addon.enabled) continue;
        if (!addon.date || !addon.time || !addon.address) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
        if (!isValidTaxiDate(addon.date)) { toast({ title: l.sundayNotAllowed, variant: 'destructive' }); return false; }
        if (!isValidTaxiTime(addon.time)) { toast({ title: l.invalidTime, variant: 'destructive' }); return false; }
      }
    }
    if (step === 3 && bookingType === 'PET_TAXI') {
      if (!taxi.date || !taxi.time || !taxi.pickupAddress || !taxi.dropoffAddress) { toast({ title: l.fillAllFields, variant: 'destructive' }); return false; }
      if (!isValidTaxiDate(taxi.date)) { toast({ title: l.sundayNotAllowed, variant: 'destructive' }); return false; }
      if (!isValidTaxiTime(taxi.time)) { toast({ title: l.invalidTime, variant: 'destructive' }); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    // Guard against state loss from browser back/refresh on step 4 — send the user
    // back to the step that's missing data instead of submitting an invalid payload.
    if (selectedPets.length === 0) { toast({ title: l.selectAtLeastOne, variant: 'destructive' }); setStep(2); return; }
    if (bookingType === 'BOARDING' && (!boarding.checkIn || !boarding.checkOut)) {
      toast({ title: l.fillAllFields, variant: 'destructive' }); setStep(3); return;
    }
    if (bookingType === 'PET_TAXI' && (!taxi.date || !taxi.time || !taxi.pickupAddress || !taxi.dropoffAddress)) {
      toast({ title: l.fillAllFields, variant: 'destructive' }); setStep(3); return;
    }
    setSubmitting(true);
    try {
      const { total } = getPriceBreakdown({
        bookingType, locale, taxiType: taxi.type,
        checkIn: boarding.checkIn, checkOut: boarding.checkOut,
        dogPets, catPets,
        groomingPets: boarding.groomingPets, petSizes: boarding.petSizes,
        taxiGoEnabled: taxiGo.enabled, taxiReturnEnabled: taxiReturn.enabled,
      });
      const body = buildBookingPayload({ bookingType, selectedPets, total, dogPets, boarding, taxiGo, taxiReturn, taxi });
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'SUNDAY_NOT_ALLOWED') { toast({ title: l.sundayNotAllowed, variant: 'destructive' }); return; }
        if (err.error === 'INVALID_TIME_SLOT') { toast({ title: l.invalidTime, variant: 'destructive' }); return; }
        if (err.error === 'CAPACITY_EXCEEDED') { toast({ title: l.capacityFull, variant: 'destructive' }); return; }
        throw new Error('Failed');
      }
      const data = await res.json();
      setBookingRef(data.bookingRef || data.id);
      setStep(5);
    } catch {
      toast({ title: pick(locale, 'Erreur lors de la réservation', 'Booking error', 'خطأ أثناء الحجز'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const nights = calculateNights(boarding.checkIn, boarding.checkOut);
  const { items: priceItems, total } = getPriceBreakdown({
    bookingType, locale, taxiType: taxi.type,
    checkIn: boarding.checkIn, checkOut: boarding.checkOut,
    dogPets, catPets,
    groomingPets: boarding.groomingPets, petSizes: boarding.petSizes,
    taxiGoEnabled: taxiGo.enabled, taxiReturnEnabled: taxiReturn.enabled,
  });
  const today = new Date().toISOString().split('T')[0];

  const onNewBooking = () => {
    setStep(1);
    setSelectedPets([]);
    boarding.setCheckIn(''); boarding.setCheckOut('');
    setBookingRef('');
    taxiGo.setEnabled(false); taxiReturn.setEnabled(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <WizardHeader locale={locale} step={step} title={l.title} />
      <WizardProgress step={step} labels={l.steps} />

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-6">{l.stepTitles[step - 1]}</h2>

        {step === 1 && <ServiceTypeStep bookingType={bookingType} setBookingType={setBookingType} isPrefill={isPrefill} locale={locale} l={l} />}

        {step === 2 && (
          <PetsStep
            pets={pets} loadingPets={loadingPets} petsError={petsError}
            selectedPets={selectedPets} togglePet={togglePet}
            reloadPets={() => setPetsReloadKey(k => k + 1)}
            locale={locale} l={l}
          />
        )}

        {step === 3 && bookingType === 'BOARDING' && (
          <BoardingDetailsStep
            locale={locale} l={l} today={today}
            capacityStatus={capacityStatus}
            dogPets={dogPets}
            boarding={boarding} taxiGo={taxiGo} taxiReturn={taxiReturn}
          />
        )}

        {step === 3 && bookingType === 'PET_TAXI' && (
          <TaxiDetailsStep locale={locale} l={l} today={today} taxi={taxi} />
        )}

        {step === 4 && (
          <SummaryStep
            locale={locale} l={l} bookingType={bookingType}
            selectedPetObjects={selectedPetObjects}
            checkIn={boarding.checkIn} checkOut={boarding.checkOut} nights={nights}
            taxiType={taxi.type} pickupAddress={taxi.pickupAddress} dropoffAddress={taxi.dropoffAddress}
            priceItems={priceItems} total={total}
          />
        )}

        {step === 5 && <ConfirmedStep locale={locale} l={l} bookingRef={bookingRef} onNewBooking={onNewBooking} />}

        <WizardNav
          step={step} l={l} submitting={submitting}
          onBack={() => setStep(s => s - 1)}
          onNext={() => { if (validateStep()) setStep(s => s + 1); }}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
