'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type CreateClientModalType from './CreateClientModal';

// Lazy-load: 161-line modal with form state. Only mounted on button click.
// Keeps the modal JS out of the /admin/clients initial bundle.
const CreateClientModal = dynamic(
  () => import('./CreateClientModal'),
  { loading: () => null, ssr: false },
);

type Props = ComponentProps<typeof CreateClientModalType>;

export default function CreateClientModalLazy(props: Props) {
  return <CreateClientModal {...props} />;
}
