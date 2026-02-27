'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { CheckCheck, Loader2, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';

interface Notification {
  id: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const locale = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const labels = {
    fr: { title: 'Notifications', empty: 'Aucune notification', markAllRead: 'Tout marquer comme lu', markRead: 'Lu' },
    en: { title: 'Notifications', empty: 'No notifications', markAllRead: 'Mark all as read', markRead: 'Read' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  useEffect(() => {
    fetch('/api/notifications').then(r => r.json()).then(data => { setNotifications(data); setLoading(false); }).catch(() => setLoading(false));
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
          {unreadCount > 0 && <span className="bg-gold-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>}
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
          {notifications.map((n) => (
            <div key={n.id} className={`bg-white rounded-xl border p-4 transition-all ${n.read ? 'border-ivory-200' : 'border-gold-300 bg-gold-50/30'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.read ? 'bg-gray-200' : 'bg-gold-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`font-medium text-sm ${n.read ? 'text-charcoal' : 'font-semibold text-charcoal'}`}>{getTitle(n)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{getMessage(n)}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(new Date(n.createdAt), locale)}</p>
                    </div>
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} className="text-xs text-gold-600 hover:underline flex-shrink-0 mt-0.5">{l.markRead}</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
