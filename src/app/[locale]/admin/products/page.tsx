import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import ProductsClient from './ProductsClient';

interface Props { params: Promise<{ locale: string }> }

export default async function AdminProductsPage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    take: 1000,
  });

  const stockValue = products.reduce((sum, p) => sum + toNumber(p.price) * p.stock, 0);

  return (
    <ProductsClient
      locale={locale}
      initialProducts={products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        reference: p.reference,
        category: p.category,
        price: toNumber(p.price),
        stock: p.stock,
        available: p.available,
        createdAt: p.createdAt.toISOString(),
      }))}
      stockValue={stockValue}
    />
  );
}
