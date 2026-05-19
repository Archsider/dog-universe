import { auth } from '../../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { parseBriefingForm } from '@/lib/pre-stay-briefing';
import BriefingFormClient from './BriefingFormClient';

interface PageProps { params: Promise<{ locale: string; id: string }> }

export default async function PreStayBriefingPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id, clientId: session.user.id }),
    select: {
      id: true,
      status: true,
      startDate: true,
      bookingPets: {
        select: { pet: { select: { name: true, species: true } } },
        take: 5,
      },
      preStayBriefing: true,
    },
  });

  if (!booking) notFound();

  // Only show the form for bookings that haven't started yet (and aren't
  // cancelled).  Past stays don't need a pre-stay briefing.
  const arrivalInFuture = booking.startDate.getTime() > Date.now() - 24 * 3600 * 1000;
  const canEdit = arrivalInFuture && ['PENDING', 'CONFIRMED'].includes(booking.status);

  const form = parseBriefingForm(booking.preStayBriefing?.formData ?? null);
  const petName = booking.bookingPets[0]?.pet?.name ?? '';

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <BriefingFormClient
        bookingId={booking.id}
        locale={locale}
        petName={petName}
        startDate={booking.startDate.toISOString()}
        initialForm={form}
        submittedAt={booking.preStayBriefing?.submittedAt?.toISOString() ?? null}
        canEdit={canEdit}
      />
    </div>
  );
}
