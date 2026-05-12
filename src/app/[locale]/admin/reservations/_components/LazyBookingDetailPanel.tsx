'use client';

import dynamic from 'next/dynamic';

// dynamic({ ssr: false }) must live in a Client Component (Next.js 15 rule).
// This thin wrapper is imported by the Server Component page.tsx, which passes
// server-prefetched initialData down as a prop — SSR pre-fetch is preserved.
const BookingDetailPanel = dynamic(
  () => import('./BookingDetailPanel'),
  { ssr: false },
);

export default BookingDetailPanel;
