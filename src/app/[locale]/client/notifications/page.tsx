'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import {
  CheckCheck, Loader2, BellOff, Camera, MessageSquare,
  CheckCircle2, XCircle, Bell, Star, Receipt, CalendarClock,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

interface Notification {
  id: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  type: string;
  metadata: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  BOOKING_CONFIRMATION: { icon: CalendarClock,  color: 'text-amber-600',  bg: 'bg-amber-50' },
  BOOKING_VALIDATION:   { icon: CheckCircle2,   color: 'text-green-600',  bg: 'bg-green-50' },
  BOOKING_REFUSAL:      { icon: XCircle,        color: 'text-red-500',    bg: 'bg-red-50' },
  STAY_REMINDER:        { icon: Bell,           color: 'text-blue-500',   bg: 'bg-blue-50' },
  INVOICE_AVAILABLE:    { icon: Receipt,        color: 'text-purple-500', bg: 'bg-purple-50' },
  ADMIN_MESSAGE:        { icon: MessageSquare,  color: 'text-gold-600',   bg: 'bg-gold-50' },
  STAY_PHOTO:           { icon: Camera,         color: 'text-gold-600',   bg: 'bg-gold-50' },
  LOYALTY_UPDATE:       { icon: Star,           color: 'text-gold-500',   bg: 'bg-gold-50' },
};

function parseMetadata(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export default function NotificationsPage() {
  const locale = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const labels = {
    fr: {
      title: 'Notifications',
      empty: 'Aucune notification',
      markAllRead: 'Tout marquer comme lu',
      markRead: 'Lu',
      viewBooking: 'Voir la réservation',
      viewPhotos: 'Voir les photos',
    },
    en: {
      title: 'Notifications',
      empty: 'No notifications',
      markAllRead: 'Mark all as read',
      markRead: 'Read',
      viewBooking: 'View booking',
      viewPhotos: 'View photos',
    },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(data => { setNotifications(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
  };

  const getTitle = (n: Notification) => locale === 'en' ? n.titleEn : n.titleFr;
  const getMessage = (n: Notification) => locale === 'en' ? n.messageEn : n.messageFr;
  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
          {unreadCount > 0 && (
            <span className="bg-gold-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAll}>
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCheck className="h-4 w-4 mr-1" />}
            {l.markAllRead}
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <BellOff className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{l.empty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-50' };
            const Icon = cfg.icon;
            const meta = parseMetadata(n.metadata);
            const bookingId = meta.bookingId;
            const showBookingLink = !!bookingId && (n.type === 'STAY_PHOTO' || n.type === 'ADMIN_MESSAGE');

            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border p-4 transition-all ${n.read ? 'border-ivory-200' : 'border-gold-300 bg-gold-50/20'}`}
                onClick={() => { if (!n.read) markRead(n.id); }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.read ? 'font-medium text-charcoal' : 'font-semibold text-charcoal'}`}>
                        {getTitle(n)}
                      </p>
                      {!n.read && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gold-500 mt-1.5" />
                      )}
                    </div>

                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{getMessage(n)}</p>

                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">{formatRelativeTime(new Date(n.createdAt), locale)}</p>

                      {showBookingLink && (
                        <Link
                          href={`/${locale}/client/bookings/${bookingId}`}
                          onClick={e => e.stopPropagation()}
                          className={`flex items-center gap-1 text-xs font-medium ${cfg.color} hover:underline`}
                        >
                          {n.type === 'STAY_PHOTO' ? l.viewPhotos : l.viewBooking}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
