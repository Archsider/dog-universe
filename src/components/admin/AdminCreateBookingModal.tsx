'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Loader2, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  PRICING_DEFAULTS,
  parsePricingSettings,
  calcNights,
  calcBoardingLines,
  calcTaxiLine,
  calcGroomingTotal,
} from '@/lib/pricing-client';
import { WALK_IN, validateBookingForm, apiErrorMessage, type Pet, type Client } from './create-booking/lib';
import { ClientPicker } from './create-booking/ClientPicker';
import { ServiceSection } from './create-booking/ServiceSection';
import { CustomLinesSection } from './create-booking/CustomLinesSection';
import { BillingSummary } from './create-booking/BillingSummary';
import { submitAdminBooking } from './create-booking/submit';
import { useBookingFormState } from './create-booking/useBookingFormState';

interface Props {
  locale: string;
  preselectedClientId?: string;
  preselectedClientName?: string;
  preselectedPets?: Pet[];
  clients?: Client[];
}

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

  const form = useBookingFormState({ preselectedClientId, preselectedPets });
  const {
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
  } = form;
  const isWalkIn = clientId === WALK_IN;

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
    if (clientId === WALK_IN) {
      setClientPets([]);
      setSelectedPetIds([]);
      return;
    }
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

  const selectedPets = useMemo(() => {
    if (isWalkIn) {
      return walkInPets
        .filter(p => p.name.trim().length > 0)
        .map((p, i) => ({ id: `walkin-${i}`, name: p.name.trim(), species: p.species }));
    }
    return clientPets.filter(p => selectedPetIds.includes(p.id));
  }, [isWalkIn, walkInPets, clientPets, selectedPetIds]);

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

  const updateCustomLine = (i: number, field: 'description' | 'quantity' | 'unitPrice', value: string | number) =>
    setCustomLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const validationErr = validateBookingForm({
      fr, isWalkIn, clientId, walkInName, walkInPets, selectedPetIds,
      startDate, serviceType, endDate, nights,
    });
    if (validationErr) {
      toast({ title: validationErr, variant: 'destructive' });
      return;
    }

    const dogs = selectedPets.filter(p => p.species === 'DOG');
    const groomingTotal = groomingEnabled ? calcGroomingTotal(dogs, groomingSize, pricing) : 0;
    const taxiAddonTotal =
      (taxiGoEnabled ? pricing.taxi_standard : 0) +
      (taxiReturnEnabled ? pricing.taxi_standard : 0);

    setLoading(true);
    try {
      const { invoiceCreated } = await submitAdminBooking({
        fr, isWalkIn, clientId, selectedPetIds,
        walkInName, walkInPhone, walkInPets,
        serviceType, startDate, endDate, taxiDate, taxiTime, taxiType,
        notes, finalTotal,
        groomingEnabled, groomingSize, groomingTotal,
        taxiGoEnabled, taxiGoDate, taxiGoTime, taxiGoAddress,
        taxiReturnEnabled, taxiReturnDate, taxiReturnTime, taxiReturnAddress,
        taxiAddonTotal,
        dogsCount: dogs.length,
        validCustomLines,
      });

      const successTitle = isWalkIn && invoiceCreated
        ? (fr ? 'Réservation + facture créées avec succès' : 'Booking + invoice created successfully')
        : (fr ? 'Réservation créée' : 'Booking created');
      toast({ title: successTitle, variant: 'success' });

      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
      toast({ title: apiErrorMessage(msg, fr), variant: 'destructive' });
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
            <div className="sticky top-0 bg-white border-b border-gray-100 flex items-center justify-between px-6 py-4 z-10">
              <h2 className="text-lg font-serif font-bold text-charcoal">
                {fr ? 'Nouvelle réservation (admin)' : 'New booking (admin)'}
              </h2>
              <button onClick={() => setOpen(false)} aria-label={fr ? 'Fermer' : 'Close'} className="text-gray-400 hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-gold-500 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              <ClientPicker
                fr={fr}
                preselectedClientId={preselectedClientId}
                preselectedClientName={preselectedClientName}
                clients={clients}
                form={form}
                togglePet={togglePet}
              />

              <ServiceSection
                fr={fr}
                pricing={pricing}
                nights={nights}
                selectedPets={selectedPets}
                form={form}
              />

              <CustomLinesSection
                fr={fr}
                customLines={customLines}
                validCount={validCustomLines.length}
                showCustomLines={showCustomLines}
                setShowCustomLines={setShowCustomLines}
                addCustomLine={addCustomLine}
                removeCustomLine={removeCustomLine}
                updateCustomLine={updateCustomLine}
              />

              <BillingSummary
                fr={fr}
                allLines={allLines}
                computedTotal={computedTotal}
                finalTotal={finalTotal}
                manualOverride={manualOverride}
                setManualOverride={setManualOverride}
                manualTotal={manualTotal}
                setManualTotal={setManualTotal}
              />

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

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                {fr
                  ? 'La réservation sera créée au statut CONFIRMÉ — source MANUELLE (WhatsApp / téléphone / passage direct).'
                  : 'The booking will be created as CONFIRMED — source MANUAL (WhatsApp / phone / walk-in).'}
              </div>
            </div>

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
