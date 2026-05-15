'use client';

import { useState } from 'react';
import { MessageSquare, Loader2, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

interface Message {
  id: string;
  messageFr: string;
  messageEn: string;
  createdAt: Date | string;
  // Soft-delete trace — `deletedAt` null = active message ; non-null =
  // displayed struck-through with "Supprimé par X le Y" label.
  deletedAt?: Date | string | null;
  deletedByName?: string | null;
}

interface Props {
  bookingId: string;
  locale: string;
  initialMessages: Message[];
}

const l = {
  fr: {
    title: 'Messages au client',
    noMessages: 'Aucun message envoyé pour cette réservation.',
    placeholder: 'Ex : Bonjour, votre chien mange bien et se porte à merveille !',
    send: 'Envoyer',
    sending: 'Envoi...',
    success: 'Message envoyé et client notifié',
    error: "Erreur lors de l'envoi",
    sentAt: 'Envoyé le',
    delete: 'Supprimer',
    deleteAria: 'Supprimer ce message',
    confirmTitle: 'Supprimer ce message ?',
    confirmDesc:
      'Le client ne verra plus ce message dans son application. Action irréversible côté client. Le message reste visible ici pour traçabilité.',
    cancel: 'Annuler',
    deleting: 'Suppression...',
    deletedBy: 'Supprimé par',
    on: 'le',
    deleteSuccess: 'Message supprimé côté client',
    deleteError: 'Erreur lors de la suppression',
  },
  en: {
    title: 'Messages to client',
    noMessages: 'No messages sent for this booking.',
    placeholder: 'E.g. Hello, your dog is eating well and doing great!',
    send: 'Send',
    sending: 'Sending...',
    success: 'Message sent and client notified',
    error: 'Error sending message',
    sentAt: 'Sent on',
    delete: 'Delete',
    deleteAria: 'Delete this message',
    confirmTitle: 'Delete this message?',
    confirmDesc:
      "The client will no longer see this message in their app. Irreversible on the client side. The message stays visible here for traceability.",
    cancel: 'Cancel',
    deleting: 'Deleting...',
    deletedBy: 'Deleted by',
    on: 'on',
    deleteSuccess: 'Message deleted from client view',
    deleteError: 'Error deleting message',
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
  // Tracks which message is currently being confirmed for deletion (open
  // the modal for that id). Null = modal closed.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        deletedAt: null,
        deletedByName: null,
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

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    // Skip the API roundtrip for optimistic-only local rows (just-sent
    // messages with `local-` prefix that haven't been refetched yet).
    // Hitting the DELETE endpoint with `local-…` would 404. We just
    // strip them from the local state.
    if (pendingDeleteId.startsWith('local-')) {
      setMessages(prev => prev.filter(m => m.id !== pendingDeleteId));
      setPendingDeleteId(null);
      toast({ title: labels.deleteSuccess, variant: 'success' });
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/${bookingId}/messages/${pendingDeleteId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed');
      // Optimistic local mark-as-deleted using "me" placeholder for the
      // deleter name (we don't have the session name in this client
      // component — the server load on next refresh will resolve it
      // properly via deleterNameById).
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingDeleteId
            ? { ...m, deletedAt: new Date().toISOString(), deletedByName: locale === 'fr' ? 'vous' : 'you' }
            : m,
        ),
      );
      setPendingDeleteId(null);
      toast({ title: labels.deleteSuccess, variant: 'success' });
    } catch {
      toast({ title: labels.deleteError, variant: 'destructive' });
    } finally {
      setDeleting(false);
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
          messages.map(msg => {
            const isDeleted = Boolean(msg.deletedAt);
            return (
              <div
                key={msg.id}
                className={
                  isDeleted
                    ? 'group relative rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 opacity-60'
                    : 'group relative rounded-lg bg-gold-50 border border-gold-200/60 px-4 py-3'
                }
              >
                <p
                  className={
                    isDeleted
                      ? 'text-sm text-charcoal/70 whitespace-pre-wrap leading-relaxed line-through'
                      : 'text-sm text-charcoal whitespace-pre-wrap leading-relaxed'
                  }
                >
                  {locale === 'en' ? msg.messageEn : msg.messageFr}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {labels.sentAt} {fmtDateTime(msg.createdAt, locale)}
                </p>
                {isDeleted && (
                  <p className="text-xs text-red-500 mt-1 italic">
                    {labels.deletedBy} {msg.deletedByName ?? '—'} {labels.on}{' '}
                    {fmtDateTime(msg.deletedAt as Date | string, locale)}
                  </p>
                )}
                {/* Trash icon — only on active messages, only visible on
                    hover so the message history stays clean by default. */}
                {!isDeleted && (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(msg.id)}
                    aria-label={labels.deleteAria}
                    className="absolute top-2 right-2 p-1.5 rounded text-charcoal/40 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })
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

      {/* Delete confirmation modal */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={open => !open && !deleting && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{labels.confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? labels.deleting : labels.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
