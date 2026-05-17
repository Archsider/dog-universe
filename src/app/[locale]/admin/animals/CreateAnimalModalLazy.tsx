'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type CreateAnimalModalType from './CreateAnimalModal';

// Lazy-load: 217-line modal with form state. Only mounted on button click.
// Keeps the modal JS out of the /admin/animals initial bundle.
const CreateAnimalModal = dynamic(
  () => import('./CreateAnimalModal'),
  { loading: () => null, ssr: false },
);

type Props = ComponentProps<typeof CreateAnimalModalType>;

export default function CreateAnimalModalLazy(props: Props) {
  return <CreateAnimalModal {...props} />;
}
