'use client';

import { useState } from 'react';
import { MessageSquare, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface Props {
  bookingId: string;
  locale: string;
}

const l = {
  fr: {
    title: 'Message au client',
    placeholder: 'Ex : Bonjour, votre chien mange bien et se porte à merveille !',
    send: 'Envoyer',
    sending: 'Envoi...',
    success: 'Message envoyé et client notifié',
    error: 'Erreur lors de l\'envoi',
  },
  en: {
    title: 'Message to client',
    placeholder: 'E.g. Hello, your dog is eating well and doing great!',
    send: 'Send',
    sending: 'Sending...',
    success: 'Message sent and client notified',
    error: 'Error sending message',
  },
};

export default function AdminMessageSection({ bookingId, locale }: Props) {
  const labels = l[locale as keyof typeof l] || l.fr;
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
      setMessage('');
      toast({ title: labels.success, variant: 'success' });
    } catch {
      toast({ title: labels.error, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{labels.title}</h3>
      </div>
      <Textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={labels.placeholder}
        className="text-sm resize-none mb-3"
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
  );
}
