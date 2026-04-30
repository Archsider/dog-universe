import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import AdminNotificationsClient from './AdminNotificationsClient';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminNotificationsPage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return null;
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      titleFr: true, titleEn: true,
      messageFr: true, messageEn: true,
      type: true,
      metadata: true,
      read: true,
      createdAt: true,
    },
  });

  const serialized = notifications.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return <AdminNotificationsClient initialNotifications={serialized} locale={locale} />;
}
