// Map des feature flags pour le user courant.
// Auth requis. Retourne `{ key: bool }` pour chaque flag DB.
// Consommé par le hook React `useFeatureFlag()`.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getAllFlagsForUser } from '@/lib/feature-flags';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const flags = await getAllFlagsForUser({
    userId: session.user.id,
    role:   session.user.role ?? null,
  });
  return NextResponse.json(flags, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
    },
  });
}
