import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import AdminProfileClient from './AdminProfileClient';
import { TotpSetupSection } from './TotpSetupSection';
import PushNotificationToggle from '@/components/admin/PushNotificationToggle';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ totp?: string }>;
};

export default async function AdminProfilePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { totp } = await searchParams;
  const session = await auth();

  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, totpEnabled: true },
  });

  if (!user) return null;

  const enrollmentRequired = totp === 'required' && !user.totpEnabled;
  const isFr = locale === 'fr';
  const isAr = locale === 'ar';

  return (
    <>
      {enrollmentRequired && (
        <div
          className="max-w-2xl mx-auto mt-4 mb-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <p className="text-sm font-semibold text-red-700">
            {isAr
              ? '🔐 المصادقة الثنائية مطلوبة'
              : isFr
                ? '🔐 Authentification à deux facteurs obligatoire'
                : '🔐 Two-factor authentication required'}
          </p>
          <p className="text-sm text-red-600 mt-1">
            {isAr
              ? 'يجب على جميع المسؤولين تفعيل المصادقة الثنائية قبل الوصول إلى لوحة التحكم.'
              : isFr
                ? 'Tous les comptes admin doivent activer la 2FA avant d\'accéder au backoffice. Configurez-la ci-dessous pour continuer.'
                : 'All admin accounts must enable 2FA before accessing the backoffice. Configure it below to continue.'}
          </p>
        </div>
      )}
      <AdminProfileClient initialProfile={user} locale={locale} />
      <div className="max-w-2xl mx-auto mt-6">
        <TotpSetupSection totpEnabled={user.totpEnabled} />
      </div>
      <div className="max-w-2xl mx-auto mt-6">
        <PushNotificationToggle locale={locale} />
      </div>
    </>
  );
}
