'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  booking: { id: string; status: string };
  locale: string;
}

export default function ReservationActions({ booking, locale }: Props) {
  const [status, setStatus] = useState(booking.status);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const labels = {
    fr: {
      updateStatus: 'Modifier le statut',
      save: 'Enregistrer',
      success: 'Statut mis à jour',
      error: 'Erreur',
      PENDING: 'En attente',
      CONFIRMED: 'Confirmer',
      IN_PROGRESS: 'En cours',
      COMPLETED: 'Terminé',
      CANCELLED: 'Annuler',
      REJECTED: 'Refuser',
    },
    en: {
      updateStatus: 'Update status',
      save: 'Save',
      success: 'Status updated',
      error: 'Error',
      PENDING: 'Pending',
      CONFIRMED: 'Confirm',
      IN_PROGRESS: 'In progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancel',
      REJECTED: 'Reject',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  const handleSave = async () => {
    if (status === booking.status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
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
        <Button onClick={handleSave} disabled={saving || status === booking.status}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
