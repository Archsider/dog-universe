import { generateSecret, generate, verify } from 'otplib';
import qrcode from 'qrcode';

export { generateSecret as generateTotpSecret };

export function getTotpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Dog Universe:${email}`);
  const issuer = encodeURIComponent('Dog Universe');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function getTotpQRCodeDataURL(secret: string, email: string): Promise<string> {
  return qrcode.toDataURL(getTotpUri(secret, email));
}

export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}

// Convenience: generate a current token (for testing)
export async function generateTotpToken(secret: string): Promise<string> {
  return generate({ secret });
}
