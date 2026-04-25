import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createSignedUrl } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, PawPrint, Calendar, MessageSquare, FileText, Download, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMAD, formatDate, getInitials, getBookingStatusColor } from '@/lib/utils';
import { LoyaltyBadge } from '@/components/shared/LoyaltyBadge';
import ClientDetailActions from './ClientDetailActions';
import EditClientInfoForm from './EditClientInfoForm';
import DeleteClientButton from './DeleteClientButton';
import CreateAnimalModal from '../../animals/CreateAnimalModal';
import HistoricalDataForm from './HistoricalDataForm';
import AdminCreateBookingModal from '@/components/admin/AdminCreateBookingModal';
import CreateStandaloneInvoiceModal from '@/components/admin/CreateStandaloneInvoiceModal';

interface PageProps { params: Promise<{ locale: string; id: string }> }

export default async function AdminClientDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const client = await prisma.user.findUnique({
    where: { id },
    include: {
      loyaltyGrade: true,
      contract: { select: { signedAt: true, storageKey: true, version: true } },
      pets: { include: { _count: { select: { bookingPets: true } } } },
      bookings: {
        include: { bookingPets: { include: { pet: { select: { name: true } } } } },
        orderBy: { startDate: 'desc' },
        take: 10,
      },
      invoices: { orderBy: { issuedAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, amount: true, paidAmount: true, status: true, issuedAt: true, paidAt: true } },
      adminNotes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      _count: { select: { bookings: true, pets: true } },
    },
  });

  if (!client || client.role !== 'CLIENT') notFound();

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', AT_PICKUP: 'Sur place', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', AT_PICKUP: 'At pickup', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };
  const isl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', PARTIALLY_PAID: 'Partiel', PAID: 'Payée', CANCELLED: 'Annulée' },
    en: { PENDING: 'Pending', PARTIALLY_PAID: 'Partial', PAID: 'Paid', CANCELLED: 'Cancelled' },
  };

  const labels = {
    fr: { back: 'Clients', contact: 'Contact', phone: 'Tél.', loyalty: 'Grade fidélité', totalRevenue: 'Revenu total', pets: 'Animaux', bookings: 'Réservations', invoices: 'Factures', notes: 'Notes internes', noNotes: 'Aucune note', noPets: 'Aucun animal', noBookings: 'Aucune réservation', noInvoices: 'Aucune facture', stays: 'séjours' },
    en: { back: 'Clients', contact: 'Contact', phone: 'Phone', loyalty: 'Loyalty grade', totalRevenue: 'Total revenue', pets: 'Pets', bookings: 'Bookings', invoices: 'Invoices', notes: 'Internal notes', noNotes: 'No notes', noPets: 'No pets', noBookings: 'No bookings', noInvoices: 'No invoices', stays: 'stays' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;
  const invStatusLbls: Record<string, string> = isl[locale] || isl.fr;

  const appRevenue = client.invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.amount, 0);
  const totalRevenue = appRevenue + (client.historicalSpendMAD ?? 0);
  const grade = client.loyaltyGrade?.grade || 'BRONZE';

  // Generate a time-limited signed URL for the contract PDF (1 hour)
  const contractDownloadUrl = client.contract?.storageKey
    ? await createSignedUrl(client.contract.storageKey).catch(() => null)
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/admin/clients`} className="text-gray-400 hover:text-charcoal"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-full bg-gold-100 flex items-center justify-center text-gold-700 font-serif font-semibold text-lg">{getInitials(client.name)}</div>
          <div>
            <h1 className="text-xl font-serif font-bold text-charcoal">{client.name}</h1>
            <p className="text-sm text-gray-500">{client.email}</p>
          </div>
        </div>
        <DeleteClientButton clientId={id} clientName={client.name} locale={locale} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-xl font-bold text-charcoal">{client._count.pets}</div><div className="text-xs text-gray-500">{l.pets}</div></div>
              <div><div className="text-xl font-bold text-charcoal">{client._count.bookings}</div><div className="text-xs text-gray-500">{locale === 'fr' ? 'Séjours' : 'Stays'}</div></div>
              <div><div className="text-sm font-bold text-charcoal">{formatMAD(totalRevenue)}</div><div className="text-xs text-gray-500">{l.totalRevenue}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <h3 className="font-semibold text-charcoal text-sm mb-3">
              {locale === 'fr' ? 'Infos client' : 'Client info'}
            </h3>
            <div className="space-y-1 mb-3 text-sm text-gray-600">
              <p className="font-medium text-charcoal">{client.name}</p>
              <p className="text-xs">{client.email}</p>
              {client.phone && <p className="text-xs">{client.phone}</p>}
            </div>
            <EditClientInfoForm
              clientId={id}
              initialName={client.name ?? ''}
              initialEmail={client.email}
              initialPhone={client.phone}
              locale={locale}
            />
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <h3 className="font-semibold text-charcoal text-sm mb-3">{l.loyalty}</h3>
            <div className="mb-3"><LoyaltyBadge grade={grade} locale={locale} /></div>
            <ClientDetailActions clientId={id} currentGrade={grade} locale={locale} phone={client.phone} isWalkIn={client.isWalkIn} />
            <HistoricalDataForm
              clientId={id}
              initialStays={client.historicalStays ?? 0}
              initialSpend={client.historicalSpendMAD ?? 0}
              initialNote={client.historicalNote ?? null}
              locale={locale}
            />
          </div>

          {/* Contract card */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-gold-500" />
              <h3 className="font-semibold text-charcoal text-sm">
                {locale === 'fr' ? 'Contrat signé' : 'Signed contract'}
              </h3>
            </div>
            {client.contract ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    ✓ {locale === 'fr' ? 'Signé' : 'Signed'}
                  </span>
                  <span className="text-xs text-gray-400">v{client.contract.version}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(client.contract.signedAt).toLocaleDateString(
                    locale === 'fr' ? 'fr-FR' : 'en-US',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  )}
                </p>
                {contractDownloadUrl && (
                  <a
                    href={contractDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                  >
                    <Download className="h-3 w-3" />
                    {locale === 'fr' ? 'Télécharger le PDF' : 'Download PDF'}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                {locale === 'fr' ? 'Pas encore signé' : 'Not yet signed'}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><PawPrint className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.pets}</h3></div>
              <CreateAnimalModal locale={locale} defaultOwnerId={id} />
            </div>
            {client.pets.length === 0 ? <p className="text-sm text-gray-400">{l.noPets}</p> : (
              <div className="space-y-2">
                {client.pets.map(pet => (
                  <Link key={pet.id} href={`/${locale}/admin/animals/${pet.id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-ivory-50 -mx-2 px-2 rounded">
                      <span className="font-medium text-sm text-charcoal">{pet.name}</span>
                      <span className="text-xs text-gray-400">{pet._count.bookingPets} {l.stays}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.bookings}</h3></div>
              <AdminCreateBookingModal
                locale={locale}
                preselectedClientId={id}
                preselectedClientName={client.name}
                preselectedPets={client.pets.map(p => ({ id: p.id, name: p.name, species: p.species }))}
              />
            </div>
            {client.bookings.length === 0 ? <p className="text-sm text-gray-400">{l.noBookings}</p> : (
              <div className="space-y-2">
                {client.bookings.map(booking => (
                  <Link key={booking.id} href={`/${locale}/admin/reservations/${booking.id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-ivory-50 -mx-2 px-2 rounded">
                      <div>
                        <Badge className={`text-xs ${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status]}</Badge>
                        <span className="text-xs text-gray-400 ml-2">{booking.bookingPets.map(bp => bp.pet.name).join(', ')}</span>
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(booking.startDate, locale)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.invoices}</h3></div>
              <div className="flex items-center gap-2">
                <Link href={`/${locale}/admin/billing?clientId=${id}`} className="text-xs text-gold-600 hover:underline">{locale === 'fr' ? 'Voir tout' : 'View all'}</Link>
                <CreateStandaloneInvoiceModal
                  clients={[{ id: client.id, name: client.name, email: client.email }]}
                  locale={locale}
                  preselectedClientId={id}
                />
              </div>
            </div>
            {client.invoices.length === 0 ? <p className="text-sm text-gray-400">{l.noInvoices}</p> : (
              <div className="space-y-2">
                {client.invoices.map(inv => {
                  const remaining = Math.max(0, inv.amount - inv.paidAmount);
                  const invStatusColor = inv.status === 'PAID' ? 'text-green-700 bg-green-50' : inv.status === 'PARTIALLY_PAID' ? 'text-orange-600 bg-orange-50' : 'text-amber-700 bg-amber-50';
                  return (
                    <div key={inv.id} className="flex items-center justify-between py-2 border-b border-ivory-100 last:border-0">
                      <div>
                        <span className="font-mono text-xs font-semibold text-charcoal">{inv.invoiceNumber}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${invStatusColor}`}>{invStatusLbls[inv.status] || inv.status}</span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatMAD(inv.amount)}
                          {inv.paidAmount > 0 && inv.status !== 'PAID' && (
                            <> · <span className="text-green-700">{formatMAD(inv.paidAmount)} {locale === 'fr' ? 'réglé' : 'paid'}</span> · <span className="text-orange-600">{formatMAD(remaining)} {locale === 'fr' ? 'restant' : 'left'}</span></>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(inv.issuedAt, locale)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.notes}</h3></div>
            {client.adminNotes.length === 0 ? <p className="text-sm text-gray-400">{l.noNotes}</p> : (
              <div className="space-y-3">
                {client.adminNotes.map(note => (
                  <div key={note.id} className="bg-ivory-50 rounded-lg p-3 text-sm">
                    <p className="text-charcoal">{note.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{note.author.name} · {formatDate(note.createdAt, locale)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
