'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type WalkinInvoiceModalType from './WalkinInvoiceModal';

// Lazy-load : ~500 LoC modal with its own form state. Only mounted on
// open click (button is rendered server-side via this wrapper).
const WalkinInvoiceModal = dynamic(
  () => import('./WalkinInvoiceModal'),
  { loading: () => null, ssr: false },
);

type Props = ComponentProps<typeof WalkinInvoiceModalType>;

export default function WalkinInvoiceModalLazy(props: Props) {
  return <WalkinInvoiceModal {...props} />;
}
