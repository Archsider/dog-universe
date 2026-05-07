// SUPERADMIN-only diagnostics page — live infra status + manual send tests.
// Server Component handles auth gate; the client component owns the polling
// and the test-send UI.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import DiagnosticsClient from './DiagnosticsClient';

export default async function DiagnosticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) redirect(`/${locale}/auth/login`);
  if (session.user.role !== 'SUPERADMIN') redirect(`/${locale}/admin/dashboard`);

  return (
    <DiagnosticsClient
      locale={locale}
      sessionEmail={session.user.email ?? ''}
    />
  );
}
