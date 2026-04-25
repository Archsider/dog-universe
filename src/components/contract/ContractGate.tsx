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
      <ContractModal
        clientName={clientName}
        onSigned={() => setSigned(true)}
      />
    );
  }

  return <>{children}</>;
}
