'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load ContractModal — bundles signature_pad (~140 KB). Only mounts
// for clients without a signed contract; signed clients never load it.
const ContractModal = dynamic(
  () => import('./ContractModal').then((m) => m.ContractModal),
  { loading: () => null, ssr: false },
);

interface ContractGateProps {
  hasContract: boolean;
  clientName: string;
  children: React.ReactNode;
}

export function ContractGate({ hasContract, clientName, children }: ContractGateProps) {
  const [signed, setSigned] = useState(hasContract);

  if (!signed) {
    return (
      <ContractModal
        clientName={clientName}
        onSigned={() => setSigned(true)}
      />
    );
  }

  return <>{children}</>;
}
