// Admin end-of-stay report page. Server Component loads the booking +
// existing report history (to surface a "déjà envoyé le X" banner),
// then hands off to the client component for the interactive form.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import EndReportClient from './EndReportClient';

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EndReportPage({ params }: Props) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    redirect(`/${locale}/auth/login`);
  }
  const isFr = locale !== 'en';

  const [booking, existingReports] = await Promise.all([
    prisma.booking.findFirst({
      where: notDeleted({ id }),
      select: {
        id: true,
        serviceType: true,
        status: true,
        startDate: true,
        endDate: true,
        client: { select: { id: true, name: true, email: true } },
        bookingPets: {
          select: {
            pet: {
              select: {
                name: true,
                species: true,
                breed: true,
                dateOfBirth: true,
              },
            },
          },
        },
      },
    }),
    prisma.endStayReport.findMany({
      where: { bookingId: id },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        sentAt: true,
        version: true,
        sender: { select: { name: true } },
      },
      take: 5,
    }),
  ]);

  if (!booking) notFound();

  const previousReports = existingReports.map((r) => ({
    id: r.id,
    sentAt: r.sentAt.toISOString(),
    version: r.version,
    sentByName: r.sender.name ?? null,
  }));

  // Pets passed to client — Date isn't JSON-safe across the boundary.
  const pets = booking.bookingPets
    .map((bp) => bp.pet)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({
      name: p.name,
      species: p.species,
      breed: p.breed,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
    }));

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <Link
        href={`/${locale}/admin/reservations/${booking.id}`}
        className="inline-flex items-center gap-1 text-sm text-charcoal/60 hover:text-charcoal"
      >
        <ChevronLeft className="h-4 w-4" />
        {isFr ? 'Retour à la réservation' : 'Back to booking'}
      </Link>
      <header>
        <h1 className="font-serif text-2xl text-charcoal">
          {isFr ? 'Rapport de fin de séjour' : 'End-of-stay report'}
        </h1>
        <p className="text-sm text-charcoal/60 mt-1">
          {isFr
            ? `Pour ${booking.client.name ?? 'le client'} · Réf. ${booking.id.slice(0, 8).toUpperCase()}`
            : `For ${booking.client.name ?? 'the client'} · Ref. ${booking.id.slice(0, 8).toUpperCase()}`}
        </p>
      </header>

      <EndReportClient
        locale={locale}
        bookingId={booking.id}
        booking={{
          serviceType: booking.serviceType,
          startDate: booking.startDate ? booking.startDate.toISOString() : null,
          endDate: booking.endDate ? booking.endDate.toISOString() : null,
        }}
        client={{
          id: booking.client.id,
          name: booking.client.name ?? '',
          email: booking.client.email,
        }}
        pets={pets}
        previousReports={previousReports}
      />
    </div>
  );
}
