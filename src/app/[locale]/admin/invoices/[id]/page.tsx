import { auth } from '../../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import InvoiceDetailClient, { type InvoiceData } from '@/components/admin/InvoiceDetailClient';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
          boardingDetail: true,
          taxiDetail: true,
        },
      },
      items: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paymentDate: 'asc' } },
    },
  });

  if (!invoice) redirect(`/${locale}/admin/billing`);

  return (
    <div>
      <div className="mb-5">
        <Link
          href={`/${locale}/admin/billing`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gold-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {locale === 'fr' ? 'Retour à la facturation' : 'Back to billing'}
        </Link>
      </div>
      <InvoiceDetailClient invoice={invoice as unknown as InvoiceData} locale={locale} />
    </div>
  );
}
