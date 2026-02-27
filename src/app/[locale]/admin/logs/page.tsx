import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react';

interface PageProps {
  params: { locale: string };
  searchParams: { page?: string; action?: string };
}

export default async function AdminLogsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const page = parseInt(searchParams.page || '1');
  const action = searchParams.action || '';
  const limit = 30;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { ...(action && { action }) };

  const [logs, total] = await Promise.all([
    prisma.actionLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.actionLog.count({ where }),
  ]);

  const labels = {
    fr: {
      title: 'Journaux d\'actions',
      actor: 'Acteur',
      action: 'Action',
      entity: 'Entité',
      date: 'Date',
      noLogs: 'Aucun journal',
      page: 'Page',
      of: 'sur',
    },
    en: {
      title: 'Action logs',
      actor: 'Actor',
      action: 'Action',
      entity: 'Entity',
      date: 'Date',
      noLogs: 'No logs',
      page: 'Page',
      of: 'of',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const totalPages = Math.ceil(total / limit);

  const actionColors: Record<string, string> = {
    USER_LOGIN: 'bg-gray-100 text-gray-600',
    USER_REGISTER: 'bg-green-100 text-green-700',
    PET_CREATED: 'bg-blue-100 text-blue-700',
    PET_UPDATED: 'bg-blue-50 text-blue-600',
    BOOKING_CREATED: 'bg-gold-100 text-gold-700',
    BOOKING_CONFIRMED: 'bg-green-100 text-green-700',
    BOOKING_REJECTED: 'bg-red-100 text-red-600',
    BOOKING_CANCELLED: 'bg-red-100 text-red-600',
    BOOKING_COMPLETED: 'bg-gray-100 text-gray-600',
    INVOICE_CREATED: 'bg-purple-100 text-purple-700',
    INVOICE_PAID: 'bg-green-100 text-green-700',
    LOYALTY_GRADE_OVERRIDE: 'bg-indigo-100 text-indigo-700',
    ADMIN_NOTE_ADDED: 'bg-gray-100 text-gray-600',
    DOCUMENT_UPLOADED: 'bg-teal-100 text-teal-700',
    PASSWORD_RESET: 'bg-red-100 text-red-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Shield className="h-4 w-4" />
          <span>{total} {locale === 'fr' ? 'entrées' : 'entries'}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{l.noLogs}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.date}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.actor}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.action}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.entity}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const actorName = log.user ? (log.user.name || log.user.email) : 'System';
                  const actionColor = actionColors[log.action] || 'bg-gray-100 text-gray-600';
                  const details = log.details ? (() => { try { return JSON.parse(log.details); } catch { return null; } })() : null;

                  return (
                    <tr key={log.id} className="border-b border-ivory-100 last:border-0 text-sm">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString(locale === 'fr' ? 'fr-MA' : 'en-US', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <div>
                          <span className="font-medium text-charcoal">{actorName}</span>
                          {log.user && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${log.user.role === 'ADMIN' ? 'bg-charcoal/10 text-charcoal' : 'bg-blue-50 text-blue-600'}`}>{log.user.role}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor}`}>{log.action}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-gray-500">
                        {log.entityType && <span>{log.entityType}</span>}
                        {log.entityId && <span className="text-xs text-gray-400 ml-1 font-mono">{log.entityId.slice(0, 8)}…</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-gray-400 max-w-[200px] truncate">
                        {details ? JSON.stringify(details).slice(0, 80) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {page > 1 && (
            <Link href={`?page=${page - 1}&action=${action}`}>
              <button className="p-2 bg-white border border-ivory-200 rounded hover:border-gold-300">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </Link>
          )}
          <span className="text-sm text-gray-500">{l.page} {page} {l.of} {totalPages}</span>
          {page < totalPages && (
            <Link href={`?page=${page + 1}&action=${action}`}>
              <button className="p-2 bg-white border border-ivory-200 rounded hover:border-gold-300">
                <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
