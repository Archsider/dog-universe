import { auth } from '../../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { NewBookingForm } from './NewBookingForm';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminNewReservationPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const [clientsRaw, settingDog, settingCat] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'CLIENT', deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        pets: {
          where: { deletedAt: null },
          select: { id: true, name: true, species: true, dateOfBirth: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
    prisma.setting.findUnique({ where: { key: 'price_per_night_dog' }, select: { value: true } }),
    prisma.setting.findUnique({ where: { key: 'price_per_night_cat' }, select: { value: true } }),
  ]);

  const clients = clientsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    pets: c.pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species as 'DOG' | 'CAT',
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
    })),
  }));

  // Default to 200 MAD/night if not configured in Settings
  const pricePerNightDog = settingDog?.value ? parseFloat(settingDog.value) || 200 : 200;
  const pricePerNightCat = settingCat?.value ? parseFloat(settingCat.value) || 200 : 200;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">
        {locale === 'fr' ? 'Créer une réservation' : 'New booking'}
      </h1>
      <NewBookingForm
        clients={clients}
        locale={locale}
        pricePerNightDog={pricePerNightDog}
        pricePerNightCat={pricePerNightCat}
      />
    </div>
  );
}
