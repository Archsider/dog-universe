'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type CreateStandaloneInvoiceModalType from './CreateStandaloneInvoiceModal';

// Lazy-load: ~543 LoC modal with its own form state, only opens on click.
const CreateStandaloneInvoiceModal = dynamic(
  () => import('./CreateStandaloneInvoiceModal'),
  { loading: () => null, ssr: false },
);

type Props = ComponentProps<typeof CreateStandaloneInvoiceModalType>;

export default function CreateStandaloneInvoiceModalLazy(props: Props) {
  return <CreateStandaloneInvoiceModal {...props} />;
}
