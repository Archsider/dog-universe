'use client';

import { useState } from 'react';
import { MessageSquare, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface Message {
  id: string;
  messageFr: string;
  messageEn: string;
  createdAt: Date | string;
}

interface Props {
  bookingId: string;
  locale: string;
  initialMessages: Message[];
}

const l = {
  fr: {
    title: 'Messages au client',
    history: 'Historique des messages',
    noMessages: 'Aucun message envoyé pour cette réservation.',
    placeholder: 'Ex : Bonjour, votre chien mange bien et se porte à merveille !',
    send: 'Envoyer',
    sending: 'Envoi...',
    success: 'Message envoyé et client notifié',
    error: "Erreur lors de l'envoi",
    sentAt: 'Envoyé le',
  },
  en: {
    title: 'Messages to client',
    history: 'Message history',
    noMessages: 'No messages sent for this booking.',
    placeholder: 'E.g. Hello, your dog is eating well and doing great!',
    send: 'Send',
    sending: 'Sending...',
    success: 'Message sent and client notified',
    error: 'Error sending message',
    sentAt: 'Sent on',
  },
};

function fmtDateTime(val: Date | string, locale: string) {
  return new Date(val).toLocaleString(locale === 'fr' ? 'fr-MA' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminMessageSection({ bookingId, locale, initialMessages }: Props) {
  const labels = l[locale as keyof typeof l] || l.fr;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageFr: message.trim(), messageEn: message.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      const newMsg: Message = {
        id: `local-${Date.now()}`,
        messageFr: message.trim(),
        messageEn: message.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, newMsg]);
      setMessage('');
      toast({ title: labels.success, variant: 'success' });
    } catch {
      toast({ title: labels.error, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{labels.title}</h3>
        {messages.length > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{messages.length}</span>
        )}
      </div>

      {/* Message history */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">{labels.noMessages}</p>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="rounded-lg bg-gold-50 border border-gold-200/60 px-4 py-3">
              <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed">
                {locale === 'en' ? msg.messageEn : msg.messageFr}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                {labels.sentAt} {fmtDateTime(msg.createdAt, locale)}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ivory-100 pt-4 space-y-3">
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={labels.placeholder}
          className="text-sm resize-none"
          rows={3}
        />
        <Button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          size="sm"
          className="w-full"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {sending ? labels.sending : labels.send}
        </Button>
      </div>
    </div>
  );
}
