'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['italic'],
  display: 'swap',
  variable: '--font-cormorant',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-dmsans',
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-dmsans), sans-serif',
  fontWeight: 500,
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color: '#9a7b2e',
};

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('errors.invalidCredentials'));
        setLoading(false);
        return;
      }

      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPERADMIN') {
        router.push(`/${locale}/admin/dashboard`);
      } else {
        router.push(`/${locale}/client/dashboard`);
      }
    } catch {
      setError(t('errors.invalidCredentials'));
      setLoading(false);
    }
  };

  return (
    <main className={`min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4 ${cormorant.variable} ${dmSans.variable}`}>
      <style>{`
        .du-input {
          width: 100%;
          background: #faf8f4;
          border: 0.5px solid #ddd0b0;
          border-radius: 4px;
          padding: 10px 12px;
          font-size: 14px;
          color: #2c2315;
          font-family: var(--font-dmsans), sans-serif;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
          box-sizing: border-box;
        }
        .du-input::placeholder {
          font-family: var(--font-cormorant), serif;
          font-style: italic;
          color: #c8b98a;
        }
        .du-input:focus {
          border-color: #9a7b2e;
          box-shadow: 0 0 0 3px rgba(154, 123, 46, 0.08);
        }
        .du-btn:hover:not(:disabled) {
          background: #7d6424 !important;
        }
      `}</style>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-block mb-6">
            <Image src="/logo.png" alt="Dog Universe" width={160} height={44} className="h-12 w-auto object-contain mx-auto" priority />
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-cormorant), serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: '34px',
            color: '#2c2315',
            lineHeight: 1.2,
            margin: 0,
          }}>
            {locale === 'fr' ? 'Vous étiez attendu.' : 'You were expected.'}
          </h1>
          <p style={{
            fontFamily: 'var(--font-cormorant), serif',
            fontStyle: 'italic',
            fontSize: '15px',
            color: '#a08c5b',
            marginTop: '8px',
          }}>
            {locale === 'fr' ? 'Votre univers est intact.' : 'Your universe is intact.'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" style={labelStyle}>{t('email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                autoComplete="email"
                className="du-input mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label htmlFor="password" style={labelStyle}>{t('password')}</label>
                <Link
                  href={`/${locale}/auth/reset-password`}
                  style={{
                    fontFamily: 'var(--font-dmsans), sans-serif',
                    fontSize: '11px',
                    color: '#9a7b2e',
                    textDecoration: 'none',
                  }}
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="du-input"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  aria-label={showPassword
                    ? (locale === 'fr' ? 'Masquer le mot de passe' : 'Hide password')
                    : (locale === 'fr' ? 'Afficher le mot de passe' : 'Show password')}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#a08c5b',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                fontSize: '13px',
                color: '#dc2626',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '8px 12px',
                fontFamily: 'var(--font-dmsans), sans-serif',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="du-btn"
              style={{
                width: '100%',
                background: loading ? '#c4a95e' : '#9a7b2e',
                color: '#ffffff',
                fontFamily: 'var(--font-dmsans), sans-serif',
                fontWeight: 500,
                fontSize: '10.5px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                borderRadius: '4px',
                padding: '13px 24px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background 0.15s',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {locale === 'fr' ? 'Connexion...' : 'Signing in...'}
                </>
              ) : (
                t('submit')
              )}
            </button>
          </form>
        </div>

        {/* Links */}
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#a08c5b',
          marginTop: '24px',
          fontFamily: 'var(--font-dmsans), sans-serif',
        }}>
          {locale === 'fr' ? 'Pas encore membre ?' : 'Not a member yet?'}{' '}
          <Link
            href={`/${locale}/auth/register`}
            style={{ color: '#9a7b2e', fontWeight: 500, textDecoration: 'none' }}
          >
            {t('register')}
          </Link>
        </p>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  );
}
