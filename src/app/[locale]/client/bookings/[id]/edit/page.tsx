'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Calendar } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface Booking {
  id: string;
  status: string;
  serviceType: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

export default function EditBookingPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) ?? 'fr';
  const bookingId = params?.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', notes: '' });

  const isFr = locale !== 'en';
  const t = isFr
    ? {
        title: 'Modifier la réservation',
        back: 'Retour',
        arrival: 'Date d\'arrivée',
        departure: 'Date de départ',
        notes: 'Notes',
        notesPlaceholder: 'Instructions particulières, demandes spéciales…',
        save: 'Enregistrer les modifications',
        saving: 'Enregistrement…',
        notPending: 'Seules les réservations en attente peuvent être modifiées.',
        success: 'Réservation modifiée',
        error: 'Erreur lors de la modification',
        notFound: 'Réservation introuvable',
      }
    : {
        title: 'Edit booking',
        back: 'Back',
        arrival: 'Arrival date',
        departure: 'Departure date',
        notes: 'Notes',
        notesPlaceholder: 'Special instructions, requests…',
        save: 'Save changes',
        saving: 'Saving…',
        notPending: 'Only pending bookings can be modified.',
        success: 'Booking updated',
        error: 'Error updating booking',
        notFound: 'Booking not found',
      };

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}`)
      .then(r => r.json())
      .then(data => {
        setBooking(data);
        setForm({
          startDate: data.startDate ? data.startDate.slice(0, 10) : '',
          endDate: data.endDate ? data.endDate.slice(0, 10) : '',
          notes: data.notes ?? '',
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);

  const handleSave = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        notes: form.notes || null,
      };
      if (form.startDate) body.startDate = form.startDate;
      if (booking.serviceType === 'BOARDING' && form.endDate) body.endDate = form.endDate;

      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: t.success, variant: 'success' });
      router.push(`/${locale}/client/bookings/${bookingId}`);
    } catch {
      toast({ title: t.error, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  if (!booking) {
    return <div className="text-center py-16 text-gray-500">{t.notFound}</div>;
  }

  if (booking.status !== 'PENDING') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-gray-500 mb-4">{t.notPending}</p>
        <Link href={`/${locale}/client/bookings/${bookingId}`} className="text-gold-600 hover:underline text-sm">
          ← {t.back}
        </Link>
      </div>
    );
  }

  const isBoarding = booking.serviceType === 'BOARDING';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/bookings/${bookingId}`} className="text-gray-400 hover:text-charcoal transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-serif font-bold text-charcoal">{t.title}</h1>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card space-y-5">
        <div>
          <Label className="flex items-center gap-1.5 mb-1.5 text-sm font-medium text-charcoal">
            <Calendar className="h-3.5 w-3.5 text-gold-500" />
            {isBoarding ? t.arrival : (isFr ? 'Date' : 'Date')}
          </Label>
          <Input
            type="date"
            min={today}
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          />
        </div>

        {isBoarding && (
          <div>
            <Label className="flex items-center gap-1.5 mb-1.5 text-sm font-medium text-charcoal">
              <Calendar className="h-3.5 w-3.5 text-gold-500" />
              {t.departure}
            </Label>
            <Input
              type="date"
              min={form.startDate || today}
              value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            />
          </div>
        )}

        <div>
          <Label className="mb-1.5 text-sm font-medium text-charcoal block">{t.notes}</Label>
          <Textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={t.notesPlaceholder}
            rows={3}
          />
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saving || !form.startDate}
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.saving}</>
            : <><Save className="h-4 w-4 mr-2" />{t.save}</>}
        </Button>
      </div>
    </div>
  );
}
