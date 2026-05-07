'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type PaymentModalType from './PaymentModal';

// Lazy-load the payment modal — fetched only when admin opens it.
// ssr: false is safe because the modal renders nothing until clicked
// (button-then-dialog pattern). Keeps PaymentModal + react-router deps
// out of the billing page initial bundle.
const PaymentModal = dynamic(() => import('./PaymentModal'), {
  loading: () => null,
  ssr: false,
});

type Props = ComponentProps<typeof PaymentModalType>;

export default function PaymentModalLazy(props: Props) {
  return <PaymentModal {...props} />;
}
