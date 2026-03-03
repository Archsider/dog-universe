import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/verify-email?token=xxx
 * Verifies the user's email address and marks it as verified.
 * Redirects to login page on success or error.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dog-universe.vercel.app';

  if (!token) {
    return NextResponse.redirect(`${appUrl}/fr/auth/login?emailVerified=error`);
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.redirect(`${appUrl}/fr/auth/login?emailVerified=expired`);
  }

  if (!record.user.emailVerified) {
    await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    });
  }

  // Delete the used token
  await prisma.emailVerificationToken.delete({ where: { id: record.id } });

  return NextResponse.redirect(`${appUrl}/fr/auth/login?emailVerified=success`);
}
