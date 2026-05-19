// Year Wrapped — annual rewind of the client's Dog Universe journey.
// Spotify-Wrapped-inspired page that turns dry stats (nights, photos,
// loyalty grade) into a shareable narrative.
//
// Source : Wave 5 (UX classe mondiale, Feature #7).

import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { casablancaYMD } from '@/lib/dates-casablanca';
import { formatMAD } from '@/lib/utils';
import { ArrowLeft, PawPrint, Moon, Camera, Heart, Award } from 'lucide-react';
import Image from 'next/image';

type Params = { locale: string };

export const dynamic = 'force-dynamic';

export default async function WrappedPage({ params, searchParams }: {
  params: Promise<Params>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale } = await params;
  const { year: yearStr } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const fr = locale === 'fr';
  const ar = locale === 'ar';

  const todayCasa = casablancaYMD();
  // Validate the ?year= param strictly — a NaN here would propagate into
  // Date.UTC(NaN, 0, 1) → Invalid Date and crash the Prisma query.  Accept
  // only 4-digit years within a reasonable past window (the app launched
  // 2024 ; older years yield nothing meaningful anyway).
  const MIN_YEAR = 2024;
  const MAX_YEAR = todayCasa.year + 1;
  const parsed = yearStr ? parseInt(yearStr, 10) : todayCasa.year;
  const year = Number.isFinite(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR
    ? parsed
    : todayCasa.year;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [completedBookings, allPets, stayPhotos, loyaltyGrade, totalPaid, allBookingPetsInYear] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...notDeleted(),
        clientId: session.user.id,
        status: 'COMPLETED',
        startDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        bookingPets: { select: { pet: { select: { id: true, name: true, species: true } } } },
      },
    }),
    prisma.pet.findMany({
      where: notDeleted({ ownerId: session.user.id }),
      select: { id: true, name: true, species: true },
    }),
    prisma.stayPhoto.findMany({
      where: {
        booking: { clientId: session.user.id, ...notDeleted() },
        createdAt: { gte: yearStart, lt: yearEnd },
      },
      select: { id: true, url: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.loyaltyGrade.findUnique({ where: { clientId: session.user.id } }),
    prisma.invoice.aggregate({
      where: {
        clientId: session.user.id,
        status: 'PAID',
        issuedAt: { gte: yearStart, lt: yearEnd },
        booking: { deletedAt: null }, // -- OK: explicit relation filter
      },
      _sum: { amount: true },
    }),
    // Count distinct pets that overlapped any of our bookings this year — the
    // "copains rencontrés" stat.  We intersect on date ranges in JS to keep
    // the SQL simple.
    prisma.bookingPet.findMany({
      where: {
        booking: {
          ...notDeleted(),
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
          startDate: { lt: yearEnd },
          endDate: { gte: yearStart },
        },
      },
      select: {
        petId: true,
        booking: {
          select: { id: true, clientId: true, startDate: true, endDate: true },
        },
      },
    }),
  ]);

  const totalNights = completedBookings.reduce((acc, b) => {
    if (!b.endDate) return acc;
    return acc + Math.max(0, Math.floor((b.endDate.getTime() - b.startDate.getTime()) / 86_400_000));
  }, 0);

  // Set of (clientPetIds, ownClientId) — figure out which OTHER pets shared
  // a date range with any of MY bookings this year.
  const myBookingIds = new Set(completedBookings.map(b => b.id));
  const myBookingsByDate = completedBookings;
  const overlapPetIds = new Set<string>();
  for (const bp of allBookingPetsInYear) {
    if (bp.booking.clientId === session.user.id) continue;
    const otherStart = bp.booking.startDate.getTime();
    const otherEnd = (bp.booking.endDate ?? bp.booking.startDate).getTime();
    for (const my of myBookingsByDate) {
      const mineStart = my.startDate.getTime();
      const mineEnd = (my.endDate ?? my.startDate).getTime();
      if (otherStart <= mineEnd && otherEnd >= mineStart) {
        overlapPetIds.add(bp.petId);
        break;
      }
    }
  }
  void myBookingIds;

  const friendsMet = overlapPetIds.size;
  const photoCount = stayPhotos.length;
  const totalSpent = Number(totalPaid._sum.amount ?? 0);
  const stayCount = completedBookings.length;
  const grade = loyaltyGrade?.grade ?? 'BRONZE';

  // Pet recap : nights per pet, highlight the one with the most stays.
  const nightsByPet = new Map<string, { name: string; nights: number }>();
  for (const b of completedBookings) {
    const nights = b.endDate ? Math.max(0, Math.floor((b.endDate.getTime() - b.startDate.getTime()) / 86_400_000)) : 0;
    for (const bp of b.bookingPets) {
      if (!bp.pet) continue;
      const prev = nightsByPet.get(bp.pet.id) ?? { name: bp.pet.name, nights: 0 };
      nightsByPet.set(bp.pet.id, { name: bp.pet.name, nights: prev.nights + nights });
    }
  }
  const topPet = [...nightsByPet.values()].sort((a, b) => b.nights - a.nights)[0];

  const empty = stayCount === 0 && photoCount === 0;

  void allPets;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#141428] via-[#0A0A1F] to-[#141428] py-8 px-4">
      <div className="max-w-md mx-auto">
        <Link
          href={`/${locale}/client/dashboard`}
          className="inline-flex items-center gap-1 text-sm text-[#D4AF37]/70 hover:text-[#D4AF37] mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {fr ? 'Retour' : 'Back'}
        </Link>

        <div className="text-center mb-8">
          <p className="text-[10px] uppercase tracking-[4px] text-[#D4AF37] font-semibold">
            {fr ? `Votre année` : ar ? 'سنتك' : 'Your year'}
          </p>
          <h1 className="font-serif text-6xl font-bold text-[#F5EDD8] mt-2">{year}</h1>
          <p className="text-sm text-[#F5EDD8]/60 mt-3 italic">
            {fr
              ? 'L\'aventure résumée en un coup d\'œil.'
              : ar ? 'مغامرتك في لمحة.' : 'Your adventure at a glance.'}
          </p>
        </div>

        {empty ? (
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-white/5 p-8 text-center">
            <PawPrint className="h-12 w-12 mx-auto text-[#D4AF37]/40 mb-3" />
            <p className="text-[#F5EDD8]/70 text-sm">
              {fr
                ? `Pas encore de souvenirs en ${year}. Réservez votre premier séjour pour commencer.`
                : `No memories in ${year} yet. Book your first stay to begin.`}
            </p>
            <Link
              href={`/${locale}/client/bookings/new`}
              className="inline-block mt-4 px-5 py-2 rounded-full bg-[#D4AF37] hover:bg-[#B8960C] text-[#141428] text-sm font-medium"
            >
              {fr ? 'Réserver' : 'Book a stay'}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <StatCard
              icon={<Moon className="h-5 w-5" />}
              label={fr ? 'Nuits cumulées' : ar ? 'الليالي المتراكمة' : 'Nights with us'}
              value={String(totalNights)}
              caption={fr
                ? `Sur ${stayCount} séjour${stayCount > 1 ? 's' : ''}`
                : `Across ${stayCount} stay${stayCount > 1 ? 's' : ''}`}
            />

            {topPet && (
              <StatCard
                icon={<PawPrint className="h-5 w-5" />}
                label={fr ? 'Votre habitué·e' : ar ? 'الزائر الدائم' : 'Top boarder'}
                value={topPet.name}
                caption={fr
                  ? `${topPet.nights} nuit${topPet.nights > 1 ? 's' : ''} adorée${topPet.nights > 1 ? 's' : ''}`
                  : `${topPet.nights} cherished night${topPet.nights > 1 ? 's' : ''}`}
                accent
              />
            )}

            {friendsMet > 0 && (
              <StatCard
                icon={<Heart className="h-5 w-5" />}
                label={fr ? 'Copains rencontrés' : ar ? 'الأصدقاء المُلتَقَون' : 'Friends met'}
                value={`+${friendsMet}`}
                caption={fr ? 'Autres compagnons croisés en pension' : 'Other companions crossed paths'}
              />
            )}

            <StatCard
              icon={<Award className="h-5 w-5" />}
              label={fr ? 'Statut fidélité' : ar ? 'حالة الولاء' : 'Loyalty status'}
              value={grade}
              caption={totalSpent > 0
                ? `${formatMAD(totalSpent)} ${fr ? 'investis dans leur bonheur' : 'invested in their joy'}`
                : ''}
              accent
            />

            {photoCount > 0 && (
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-white/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="h-5 w-5 text-[#D4AF37]" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-[2px] text-[#D4AF37]/70">
                      {fr ? 'Album de l\'année' : ar ? 'ألبوم العام' : 'Year album'}
                    </p>
                    <p className="text-sm text-[#F5EDD8] font-semibold mt-0.5">
                      {photoCount} {fr ? 'photo' + (photoCount > 1 ? 's' : '') : ar ? 'صور' : 'photo' + (photoCount > 1 ? 's' : '')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {stayPhotos.slice(0, 9).map((p) => (
                    <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <Image src={p.url} alt="" width={120} height={120} className="object-cover w-full h-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-[10px] uppercase tracking-[2px] text-[#D4AF37]/40">
            Dog Universe · Marrakech
          </p>
          <p className="text-xs text-[#F5EDD8]/40 italic mt-1">
            {fr ? '« Merci pour votre confiance. »' : '"Thank you for your trust."'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, caption, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${
      accent
        ? 'border-[#D4AF37]/50 bg-gradient-to-br from-[#D4AF37]/15 to-transparent'
        : 'border-[#D4AF37]/20 bg-white/5'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${accent ? 'bg-[#D4AF37]/25 text-[#D4AF37]' : 'bg-white/5 text-[#D4AF37]/70'}`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[2px] text-[#D4AF37]/70">{label}</p>
          <p className="font-serif text-3xl font-bold text-[#F5EDD8] mt-0.5 leading-tight">{value}</p>
          {caption && <p className="text-xs text-[#F5EDD8]/60 mt-1">{caption}</p>}
        </div>
      </div>
    </div>
  );
}
