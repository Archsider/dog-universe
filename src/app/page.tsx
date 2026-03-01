import { redirect } from 'next/navigation';

// Fallback: redirect root to default locale
// (normally handled by next-intl middleware)
export default function RootPage() {
  redirect('/fr');
}
