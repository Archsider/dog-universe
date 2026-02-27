import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PricingForm from './PricingForm';

interface PageProps { params: { locale: string } }

const DEFAULT_SETTINGS: Record<string, string> = {
  boarding_dog_per_night: '120',
  boarding_cat_per_night: '70',
  boarding_dog_long_stay: '100',
  boarding_dog_multi: '100',
  long_stay_threshold: '32',
  grooming_small_dog: '100',
  grooming_large_dog: '150',
  taxi_standard: '150',
  taxi_vet: '300',
  taxi_airport: '300',
};

export default async function AdminSettingsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const rows = await prisma.setting?.findMany() ?? [];
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return <PricingForm initialValues={settings} />;
}
