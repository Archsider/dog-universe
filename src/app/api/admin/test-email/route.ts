import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { sendEmail, getEmailTemplate } from '@/lib/email';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const to: string = body.to;
  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: 'Missing "to" field' }, { status: 400 });
  }

  const { subject, html } = getEmailTemplate(
    'welcome',
    {
      clientName: 'Admin Test',
      loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma',
    },
    'fr'
  );

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  const isDev = process.env.NODE_ENV !== 'production';
  return NextResponse.json({
    success: true,
    to,
    ...(isDev && result.previewUrl
      ? {
          previewUrl: result.previewUrl,
          note: "Mode développement : l'email n'est pas envoyé réellement. Ouvrez previewUrl pour le voir.",
        }
      : {}),
  });
}
