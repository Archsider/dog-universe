import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import NotificationsClient, { type NotificationData } from './NotificationsClient';

interface PageProps { params: Promise<{ locale: string }> }

export default async function NotificationsPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const rows = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      titleFr: true,
      titleEn: true,
      messageFr: true,
      messageEn: true,
      type: true,
      metadata: true,
      read: true,
      createdAt: true,
    },
  });

  const notifications: NotificationData[] = rows.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationsClient initialNotifications={notifications} locale={locale} />;
}
