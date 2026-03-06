import { NextResponse } from 'next/server';

// Bootstrap endpoint disabled — use /api/admin/maintenance for admin promotion
// or the Prisma seed script directly.
export async function POST() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}
