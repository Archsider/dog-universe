'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, PlayCircle, Flag, ChevronDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  booking: { id: string; status: string };
  locale: string;
}

interface ActionDef {
  status: string;
  labelFr: string;
  labelEn: string;
  icon: React.ElementType;
  className: string;
}

const TRANSITIONS: Record<string, ActionDef[]> = {
  PENDING: [
    { status: 'CONFIRMED', labelFr: 'Confirmer', labelEn: 'Confirm',    icon: CheckCircle2, className: 'bg-green-600 hover:bg-green-700 text-white border-0' },
    { status: 'REJECTED',  labelFr: 'Refuser',   labelEn: 'Reject',     icon: XCircle,      className: 'bg-red-500 hover:bg-red-600 text-white border-0' },
  ],
  CONFIRMED: [
    { status: 'IN_PROGRESS', labelFr: 'Démarrer',  labelEn: 'Start stay', icon: PlayCircle, className: 'bg-blue-600 hover:bg-blue-700 text-white border-0' },
    { status: 'CANCELLED',   labelFr: 'Annuler',   labelEn: 'Cancel',     icon: XCircle,    className: 'text-red-500 border-red-200 hover:bg-red-50' },
  ],
  IN_PROGRESS: [
    { status: 'COMPLETED', labelFr: 'Terminer', labelEn: 'Complete', icon: Flag, className: 'bg-charcoal hover:bg-charcoal/80 text-white border-0' },
  ],
};

const ALL_STATUSES: ActionDef[] = [
  { status: 'PENDING',     labelFr: 'En attente', labelEn: 'Pending',     icon: Loader2,      className: '' },
  { status: 'CONFIRMED',   labelFr: 'Confirmé',   labelEn: 'Confirmed',   icon: CheckCircle2, className: '' },
  { status: 'IN_PROGRESS', labelFr: 'En cours',   labelEn: 'In progress', icon: PlayCircle,   className: '' },
  { status: 'COMPLETED',   labelFr: 'Terminé',    labelEn: 'Completed',   icon: Flag,         className: '' },
  { status: 'CANCELLED',   labelFr: 'Annulé',     labelEn: 'Cancelled',   icon: XCircle,      className: '' },
  { status: 'REJECTED',    labelFr: 'Refusé',     labelEn: 'Rejected',    icon: XCircle,      className: '' },
];

export default function ReservationActions({ booking, locale }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const isFr = locale !== 'en';

  const label = (a: ActionDef) => isFr ? a.labelFr : a.labelEn;

  const updateStatus = async (status: string) => {
    setSaving(status);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const quickActions = TRANSITIONS[booking.status] ?? [];

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">
        {isFr ? 'Actions' : 'Actions'}
      </h3>

      {quickActions.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {quickActions.map(action => {
            const Icon = action.icon;
            const isLoading = saving === action.status;
            return (
              <Button
                key={action.status}
                size="sm"
                onClick={() => updateStatus(action.status)}
                disabled={!!saving}
                className={action.className}
                variant="outline"
              >
                {isLoading
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  : <Icon className="h-4 w-4 mr-1.5" />}
                {label(action)}
              </Button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowAll(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        {isFr ? 'Autre statut…' : 'Other status…'}
      </button>

      {showAll && (
        <div className="flex gap-1.5 flex-wrap mt-2 pt-2 border-t border-gray-100">
          {ALL_STATUSES.filter(a => a.status !== booking.status).map(action => {
            const Icon = action.icon;
            const isLoading = saving === action.status;
            return (
              <button
                key={action.status}
                onClick={() => updateStatus(action.status)}
                disabled={!!saving}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-gray-600 border border-gray-200 hover:border-gold-300 hover:bg-gold-50 transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
                {label(action)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
