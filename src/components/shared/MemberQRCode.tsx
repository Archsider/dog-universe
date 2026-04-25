'use client';

import { QRCodeSVG } from 'qrcode.react';

interface MemberQRCodeProps {
  clientId: string;
  grade: string;
  size?: number;
}

export function MemberQRCode({ clientId, grade, size = 80 }: MemberQRCodeProps) {
  // Encode a compact identifier — staff scans this to open the client profile in admin
  const value = `du:client:${clientId}`;

  const fgColor =
    grade === 'PLATINUM' ? '#D4AF37'
    : grade === 'GOLD' ? '#B8960C'
    : grade === 'SILVER' ? '#7070A0'
    : '#A0704A';

  const bgColor =
    grade === 'PLATINUM' ? 'transparent' : 'transparent';

  return (
    <QRCodeSVG
      value={value}
      size={size}
      fgColor={fgColor}
      bgColor={bgColor}
      level="M"
    />
  );
}
