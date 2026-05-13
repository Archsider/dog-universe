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

  // Load both active and archived so the "Show archived" toggle is instant.
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    take: 1000,
  });

  // Stock value = only active products contribute (archived stock is conceptually gone).
  const stockValue = products.reduce(
    (sum, p) => sum + (p.isArchived ? 0 : toNumber(p.price) * p.stock),
    0,
  );

  return (
    <ProductsClient
      locale={locale}
      initialProducts={products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        reference: p.reference,
        category: p.category,
        description: p.description,
        price: toNumber(p.price),
        costPrice: p.costPrice == null ? null : toNumber(p.costPrice),
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        available: p.available,
        isArchived: p.isArchived,
        version: p.version,
        targetSpecies: p.targetSpecies,
        targetAge: p.targetAge,
        supplier: p.supplier,
        weight: p.weight,
        imageUrl: p.imageUrl,
        createdAt: p.createdAt.toISOString(),
      }))}
      stockValue={stockValue}
    />
  );
}
