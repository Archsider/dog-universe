'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Car, ChevronRight, CheckCheck, Loader2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface Booking {
  id: string;
  status: string;
  serviceType: string;
  startDate: string | Date;
  endDate: string | Date | null;
  client: { id: string; name: string };
  bookingPets: { pet: { name: string } }[];
  invoice: { amount: number } | null;
}

interface Props {
  bookings: Booking[];
  locale: string;
  statusLbls: Record<string, string>;
  noBookings: string;
}

const BULK_ACTIONS = [
  { status: 'CONFIRMED',   labelFr: 'Confirmer',    labelEn: 'Confirm',    className: 'bg-green-600 hover:bg-green-700 text-white border-0' },
  { status: 'REJECTED',    labelFr: 'Refuser',      labelEn: 'Reject',     className: 'bg-red-500 hover:bg-red-600 text-white border-0' },
  { status: 'COMPLETED',   labelFr: 'Terminer',     labelEn: 'Complete',   className: 'bg-charcoal hover:bg-charcoal/80 text-white border-0' },
  { status: 'CANCELLED',   labelFr: 'Annuler',      labelEn: 'Cancel',     className: 'text-red-500 border-red-200 hover:bg-red-50' },
];

export default function ReservationsTable({ bookings, locale, statusLbls, noBookings }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const router = useRouter();
  const isFr = locale !== 'en';

  const toggleAll = () => {
    setSelected(prev => prev.size === bookings.length ? new Set() : new Set(bookings.map(b => b.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulk = async (status: string) => {
    if (selected.size === 0) return;
    setApplying(status);
    try {
      const res = await fetch('/api/admin/bookings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast({ title: isFr ? `${data.updated} réservation(s) mise(s) à jour` : `${data.updated} booking(s) updated`, variant: 'success' });
      setSelected(new Set());
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card">
        <div className="text-center py-12 text-gray-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{noBookings}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-charcoal/5 border border-charcoal/10 rounded-xl">
          <span className="text-sm font-medium text-charcoal">
            {selected.size} {isFr ? 'sélectionné(s)' : 'selected'}
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {BULK_ACTIONS.map(a => (
              <Button
                key={a.status}
                size="sm"
                variant="outline"
                className={a.className}
                disabled={!!applying}
                onClick={() => applyBulk(a.status)}
              >
                {applying === a.status
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  : <CheckCheck className="h-3.5 w-3.5 mr-1" />}
                {isFr ? a.labelFr : a.labelEn}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ivory-200 bg-ivory-50">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === bookings.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-gold-500 focus:ring-gold-400 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{isFr ? 'Client' : 'Client'}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{isFr ? 'Animaux' : 'Pets'}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{isFr ? 'Date' : 'Date'}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Statut</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Total</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {bookings.map(booking => {
                const isBoarding = booking.serviceType === 'BOARDING';
                const isChecked = selected.has(booking.id);
                return (
                  <tr
                    key={booking.id}
                    className={`border-b border-ivory-100 last:border-0 transition-colors ${isChecked ? 'bg-gold-50/50' : 'hover:bg-ivory-50'}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(booking.id)}
                        className="rounded border-gray-300 text-gold-500 focus:ring-gold-400 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isBoarding ? <Package className="h-4 w-4 text-gold-400" /> : <Car className="h-4 w-4 text-blue-400" />}
                        <span className="font-mono text-xs text-gray-500">{booking.id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/${locale}/admin/clients/${booking.client.id}`} className="text-sm font-medium text-charcoal hover:text-gold-600">
                        {booking.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                      {booking.bookingPets.map(bp => bp.pet.name).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {formatDate(new Date(booking.startDate), locale)}
                      {booking.endDate ? ` → ${formatDate(new Date(booking.endDate), locale)}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-xs ${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-charcoal hidden lg:table-cell">
                      {booking.invoice ? formatMAD(booking.invoice.amount) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/${locale}/admin/reservations/${booking.id}`}>
                        <ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
