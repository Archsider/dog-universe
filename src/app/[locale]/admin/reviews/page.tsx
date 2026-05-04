import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Star, ArrowLeft } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; rating?: string; sort?: string }>;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'text-gold-500 fill-gold-500' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
    </div>
  );
}

export default async function AdminReviewsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const take = 20;
  const skip = (page - 1) * take;
  const ratingFilter = sp.rating ? parseInt(sp.rating, 10) : undefined;
  const sortField: 'createdAt' | 'rating' = sp.sort === 'rating' ? 'rating' : 'createdAt';

  const where = ratingFilter && ratingFilter >= 1 && ratingFilter <= 5
    ? { rating: ratingFilter }
    : {};

  const [reviews, total, globalStats] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { id: true, serviceType: true, startDate: true, endDate: true } },
      },
      orderBy: { [sortField]: 'desc' },
      take,
      skip,
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({ _avg: { rating: true }, _count: { id: true } }),
  ]);

  const totalPages = Math.ceil(total / take);
  const avgRating = globalStats._avg.rating ?? 0;
  const totalReviews = globalStats._count.id;

  const serviceLabels: Record<string, string> = {
    BOARDING: locale === 'fr' ? 'Pension' : 'Boarding',
    PET_TAXI: locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/admin/dashboard`} className="text-gray-400 hover:text-charcoal transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-serif font-bold text-charcoal">
            {locale === 'fr' ? 'Avis clients' : 'Client reviews'}
          </h1>
          <p className="text-sm text-gray-500">
            {locale === 'fr' ? 'Avis post-séjour' : 'Post-stay feedback'}
          </p>
        </div>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-sm text-gray-500 mb-1">{locale === 'fr' ? 'Note moyenne' : 'Average rating'}</p>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold text-charcoal">{avgRating.toFixed(1)}</span>
            <StarRating rating={Math.round(avgRating)} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-sm text-gray-500 mb-1">{locale === 'fr' ? 'Total avis' : 'Total reviews'}</p>
          <span className="text-3xl font-bold text-charcoal">{totalReviews}</span>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <Link href={`?sort=${sp.sort ?? 'createdAt'}`}>
          <button className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${!ratingFilter ? 'bg-charcoal text-white border-charcoal' : 'bg-white border-gray-200 text-gray-600 hover:border-gold-300'}`}>
            {locale === 'fr' ? 'Tous' : 'All'}
          </button>
        </Link>
        {[5, 4, 3, 2, 1].map(r => (
          <Link key={r} href={`?rating=${r}&sort=${sp.sort ?? 'createdAt'}`}>
            <button className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${ratingFilter === r ? 'bg-charcoal text-white border-charcoal' : 'bg-white border-gray-200 text-gray-600 hover:border-gold-300'}`}>
              {r} <Star className="h-3.5 w-3.5 fill-current" />
            </button>
          </Link>
        ))}
        <div className="ml-auto flex gap-2">
          <Link href={`?${ratingFilter ? `rating=${ratingFilter}&` : ''}sort=createdAt`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${sortField === 'createdAt' ? 'bg-gold-50 text-gold-700 border-gold-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gold-300'}`}>
              {locale === 'fr' ? 'Date' : 'Date'}
            </button>
          </Link>
          <Link href={`?${ratingFilter ? `rating=${ratingFilter}&` : ''}sort=rating`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${sortField === 'rating' ? 'bg-gold-50 text-gold-700 border-gold-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gold-300'}`}>
              {locale === 'fr' ? 'Note' : 'Rating'}
            </button>
          </Link>
        </div>
      </div>

      {/* Liste avis */}
      {reviews.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <Star className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium text-charcoal">
            {locale === 'fr' ? 'Aucun avis' : 'No reviews yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StarRating rating={review.rating} />
                    <span className="text-sm font-medium text-charcoal">({review.rating}/5)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Link href={`/${locale}/admin/clients/${review.client.id}`} className="font-medium text-charcoal hover:text-gold-600 transition-colors">
                      {review.client.name}
                    </Link>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{review.client.email}</span>
                  </div>
                  {review.comment && (
                    <p className="mt-2 text-sm text-gray-700 italic">&ldquo;{review.comment}&rdquo;</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{formatDate(review.createdAt, locale)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {serviceLabels[review.booking.serviceType] ?? review.booking.serviceType}
                  </p>
                  <Link
                    href={`/${locale}/admin/reservations/${review.booking.id}`}
                    className="text-xs text-gold-600 hover:text-gold-700 font-medium"
                  >
                    #{review.booking.id.slice(0, 8).toUpperCase()}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`?page=${page - 1}${ratingFilter ? `&rating=${ratingFilter}` : ''}&sort=${sortField}`}>
              <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:border-gold-300 text-gray-600">
                {locale === 'fr' ? 'Précédent' : 'Previous'}
              </button>
            </Link>
          )}
          <span className="text-sm text-gray-500">
            {locale === 'fr' ? `Page ${page} sur ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          {page < totalPages && (
            <Link href={`?page=${page + 1}${ratingFilter ? `&rating=${ratingFilter}` : ''}&sort=${sortField}`}>
              <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:border-gold-300 text-gray-600">
                {locale === 'fr' ? 'Suivant' : 'Next'}
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
