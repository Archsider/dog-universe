'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Download, Eye, Mail, Trash2, Loader2, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getInitials, formatDate } from '@/lib/utils';

interface Contract {
  signedAt: Date;
  downloadUrl: string | null;
  version: string;
  id: string;
}

interface Client {
  id: string;
  name: string | null;
  email: string;
  contract: Contract | null;
}

interface Props {
  clients: Client[];
  locale: string;
}

export default function ContractsManager({ clients, locale }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  const isFr = locale === 'fr';
  const l = {
    statusSigned: isFr ? 'Signé' : 'Signed',
    statusUnsigned: isFr ? 'Non signé' : 'Unsigned',
    download: isFr ? 'Télécharger' : 'Download',
    remind: isFr ? 'Envoyer un rappel' : 'Send reminder',
    remindAll: isFr ? 'Rappeler tous les non-signés' : 'Remind all unsigned',
    delete: isFr ? 'Supprimer le contrat' : 'Delete contract',
    confirmDelete: isFr
      ? 'Supprimer ce contrat ? Le client devra le re-signer.'
      : 'Delete this contract? The client will need to re-sign.',
    reminderSent: isFr ? 'Rappel envoyé !' : 'Reminder sent!',
    reminderError: isFr ? 'Erreur lors de l\'envoi' : 'Error sending reminder',
    deleteSuccess: isFr ? 'Contrat supprimé' : 'Contract deleted',
    deleteError: isFr ? 'Erreur lors de la suppression' : 'Error deleting contract',
    allRemindersSent: (n: number) => isFr ? `${n} rappel(s) envoyé(s)` : `${n} reminder(s) sent`,
  };

  const sendReminder = async (clientId: string) => {
    setLoadingId(`remind-${clientId}`);
    try {
      const res = await fetch('/api/admin/contracts/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.ok && data.sent > 0) {
        toast({ title: l.reminderSent, variant: 'success' });
      } else {
        toast({ title: l.reminderError, variant: 'destructive' });
      }
    } catch {
      toast({ title: l.reminderError, variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  const sendAllReminders = async () => {
    setSendingAll(true);
    try {
      const res = await fetch('/api/admin/contracts/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      toast({ title: l.allRemindersSent(data.sent ?? 0), variant: 'success' });
    } catch {
      toast({ title: l.reminderError, variant: 'destructive' });
    } finally {
      setSendingAll(false);
    }
  };

  const deleteContract = async (contractId: string) => {
    if (!confirm(l.confirmDelete)) return;
    setLoadingId(`delete-${contractId}`);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: l.deleteSuccess, variant: 'success' });
        router.refresh();
      } else {
        toast({ title: l.deleteError, variant: 'destructive' });
      }
    } catch {
      toast({ title: l.deleteError, variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  const unsignedCount = clients.filter(c => !c.contract).length;

  return (
    <div className="space-y-3">
      {/* Send all reminders button */}
      {unsignedCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={sendAllReminders}
            disabled={sendingAll}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors"
          >
            {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {l.remindAll} ({unsignedCount})
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ivory-200 bg-ivory-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  {isFr ? 'Client' : 'Client'}
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">
                  {isFr ? 'Email' : 'Email'}
                </th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">
                  {isFr ? 'Statut' : 'Status'}
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">
                  {isFr ? 'Date de signature' : 'Signed on'}
                </th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">
                  {isFr ? 'Version' : 'Version'}
                </th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">
                  {isFr ? 'Actions' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-xs font-semibold text-gold-700 flex-shrink-0">
                        {getInitials(client.name ?? '')}
                      </div>
                      <span className="font-medium text-sm text-charcoal">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{client.email}</td>
                  <td className="px-4 py-3 text-center">
                    {client.contract ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        {l.statusSigned}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                        <XCircle className="h-3 w-3" />
                        {l.statusUnsigned}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                    {client.contract ? formatDate(client.contract.signedAt.toISOString()) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500 hidden lg:table-cell">
                    {client.contract ? `v${client.contract.version}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {client.contract?.downloadUrl ? (
                        <>
                          <a
                            href={client.contract.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={isFr ? 'Aperçu' : 'Preview'}
                            className="p-1.5 text-gray-400 hover:text-gold-600 rounded transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={client.contract.downloadUrl}
                            download
                            title={l.download}
                            className="p-1.5 text-gray-400 hover:text-gold-600 rounded transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => deleteContract(client.contract!.id)}
                            disabled={loadingId === `delete-${client.contract!.id}`}
                            title={l.delete}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors disabled:opacity-50"
                          >
                            {loadingId === `delete-${client.contract!.id}`
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />
                            }
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => sendReminder(client.id)}
                          disabled={loadingId === `remind-${client.id}`}
                          title={l.remind}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full transition-colors disabled:opacity-50"
                        >
                          {loadingId === `remind-${client.id}`
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Mail className="h-3 w-3" />
                          }
                          {l.remind}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
