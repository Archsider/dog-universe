'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Détecte l'expiration de session JWT NextAuth sans SessionProvider.
 * Vérifie /api/auth/session à chaque retour de focus (tab switch, retour veille).
 * Si la session est vide (token expiré), redirige vers le login.
 */
export function SessionWatcher({ loginPath }: { loginPath: string }) {
  const router = useRouter();
  const checkingRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        if (!data?.user) {
          router.replace(loginPath);
        }
      } catch {
        // Réseau coupé — on ne redirige pas, l'utilisateur verra les erreurs API
      } finally {
        checkingRef.current = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loginPath, router]);

  return null;
}
