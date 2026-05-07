'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type AdminCreateBookingModalType from './AdminCreateBookingModal';

// Lazy-load: heaviest admin modal (date picker + capacity + pet picker +
// pricing presets). Only opens on click from /admin/clients/[id].
const AdminCreateBookingModal = dynamic(
  () => import('./AdminCreateBookingModal'),
  { loading: () => null, ssr: false },
);

type Props = ComponentProps<typeof AdminCreateBookingModalType>;

export default function AdminCreateBookingModalLazy(props: Props) {
  return <AdminCreateBookingModal {...props} />;
}
