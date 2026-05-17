import { Clock, MessageSquare } from 'lucide-react';
import type { SmsStats } from './types';

interface SmsSectionProps {
  smsStats: SmsStats | null;
  isFr: boolean;
}

export function SmsSection({ smsStats, isFr }: SmsSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-gray-500" />
        SMS
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        {smsStats === null ? (
          <p className="text-sm text-gray-500">
            {isFr ? 'Données SMS indisponibles (SmsLog non peuplé).' : 'SMS data unavailable (SmsLog not populated).'}
          </p>
        ) : (
          <>
            {/* KPI strip: sent / pending / duplicates blocked / last activity. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-2xl font-bold text-emerald-700">{smsStats.sent24h}</div>
                <div className="text-xs text-emerald-700/80">
                  {isFr ? 'Envoyés (24h)' : 'Sent (24h)'}
                </div>
              </div>
              <div className={`rounded-md border p-3 ${
                smsStats.pending24h > 0
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-gray-200 bg-gray-50'
              }`}>
                <div className={`text-2xl font-bold ${
                  smsStats.pending24h > 0 ? 'text-amber-700' : 'text-gray-600'
                }`}>
                  {smsStats.pending24h}
                </div>
                <div className={`text-xs ${
                  smsStats.pending24h > 0 ? 'text-amber-700/80' : 'text-gray-500'
                }`}>
                  {isFr ? 'En attente / échecs' : 'Pending / failed'}
                </div>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <div className="text-2xl font-bold text-blue-700">{smsStats.blockedToday}</div>
                <div className="text-xs text-blue-700/80">
                  {isFr ? 'Doublons bloqués (auj.)' : 'Duplicates blocked (today)'}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3 flex items-start gap-2">
                <Clock className="h-3 w-3 mt-1 text-gray-500 flex-shrink-0" />
                <div className="text-xs">
                  <div className="text-gray-500 mb-1">{isFr ? 'Dernier envoi' : 'Last send'}</div>
                  <div className="font-medium text-charcoal">
                    {smsStats.lastSentAt
                      ? new Date(smsStats.lastSentAt).toLocaleString(
                          isFr ? 'fr-FR' : 'en-GB',
                          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                        )
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent activity — the last 20 attempts, phone-masked. The
                PENDING badge surfaces in amber so failed sends jump out. */}
            {smsStats.recent.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  {isFr ? 'Activité récente' : 'Recent activity'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500">
                        <th className="text-left py-1 pr-3 font-medium">
                          {isFr ? 'Destinataire' : 'To'}
                        </th>
                        <th className="text-left py-1 pr-3 font-medium">Status</th>
                        <th className="text-left py-1 font-medium">
                          {isFr ? 'Quand' : 'When'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsStats.recent.map((row, i) => (
                        <tr key={`${row.sentAt}-${i}`} className="border-b border-gray-100 last:border-0">
                          <td className="py-1 pr-3 font-mono text-charcoal">{row.phone}</td>
                          <td className="py-1 pr-3">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              row.status === 'SENT'
                                ? 'bg-emerald-100 text-emerald-700'
                                : row.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-1 text-gray-600">
                            {new Date(row.sentAt).toLocaleString(
                              isFr ? 'fr-FR' : 'en-GB',
                              { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
