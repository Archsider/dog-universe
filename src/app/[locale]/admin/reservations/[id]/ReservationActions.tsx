'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  booking: { id: string; status: string; serviceType: string; endDate?: string | null };
  locale: string;
}

export default function ReservationActions({ booking, locale }: Props) {
  const [status, setStatus] = useState(booking.status);
  const [endDate, setEndDate] = useState(
    booking.endDate ? booking.endDate.split('T')[0] : ''
  );
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const labels = {
    fr: {
      updateStatus: 'Modifier le statut',
      save: 'Enregistrer',
      success: 'Réservation mise à jour',
      error: 'Erreur',
      PENDING: 'En attente',
      CONFIRMED: 'Confirmer',
      IN_PROGRESS: 'En cours',
      COMPLETED: 'Terminé',
      CANCELLED: 'Annuler',
      REJECTED: 'Refuser',
      extendStay: 'Prolonger le séjour',
      newCheckOut: 'Nouvelle date de départ',
    },
    en: {
      updateStatus: 'Update status',
      save: 'Save',
      success: 'Booking updated',
      error: 'Error',
      PENDING: 'Pending',
      CONFIRMED: 'Confirm',
      IN_PROGRESS: 'In progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancel',
      REJECTED: 'Reject',
      extendStay: 'Extend stay',
      newCheckOut: 'New check-out date',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  const handleSave = async () => {
    const statusChanged = status !== booking.status;
    const endDateChanged =
      booking.serviceType === 'BOARDING' &&
      endDate &&
      endDate !== (booking.endDate ? booking.endDate.split('T')[0] : '');

    if (!statusChanged && !endDateChanged) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (statusChanged) payload.status = status;
      if (endDateChanged) payload.endDate = new Date(endDate).toISOString();

      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    status !== booking.status ||
    (booking.serviceType === 'BOARDING' &&
      endDate &&
      endDate !== (booking.endDate ? booking.endDate.split('T')[0] : ''));

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">{l.updateStatus}</h3>
      <div className="flex gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'].map(s => (
              <SelectItem key={s} value={s}>{l[s as keyof typeof l] || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>

      {booking.serviceType === 'BOARDING' && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">{l.newCheckOut}</label>
          <input
            type="date"
            value={endDate}
            min={booking.endDate ? booking.endDate.split('T')[0] : undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-charcoal focus:outline-none focus:border-gold-400"
          />
        </div>
      )}
    </div>
  );
}
