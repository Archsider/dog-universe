'use client';

import { useState } from 'react';
import { ContractModal } from './ContractModal';

interface ContractGateProps {
  hasContract: boolean;
  clientName: string;
  children: React.ReactNode;
}

export function ContractGate({ hasContract, clientName, children }: ContractGateProps) {
  const [signed, setSigned] = useState(hasContract);

  if (!signed) {
    return (
      <>
        {/* Render children behind (blurred) but block interaction */}
        <div className="pointer-events-none select-none filter blur-sm opacity-30 fixed inset-0" aria-hidden="true" />
        <ContractModal
          clientName={clientName}
          onSigned={() => setSigned(true)}
        />
      </>
    );
  }

  return <>{children}</>;
}
