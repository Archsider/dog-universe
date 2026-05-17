'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setError(locale === 'fr' ? 'Veuillez entrer votre prénom et votre nom de famille.' : 'Please enter your first and last name.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('errors.weakPassword'));
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password)) {
      setError(locale === 'fr'
        ? 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.'
        : 'Password must contain at least one uppercase letter, one lowercase letter, and one digit.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.toLowerCase().trim(),
          phone: form.phone.trim(),
          password: form.password,
          language: locale,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'EMAIL_TAKEN') {
          setError(t('errors.emailTaken'));
        } else if (data.error === 'VALIDATION_ERROR' && Array.isArray(data.details) && data.details.length > 0) {
          const raw: string = data.details[0];
          const msg = raw.includes(': ') ? raw.split(': ').slice(1).join(': ') : raw;
          setError(msg);
        } else {
          setError(data.message ?? (locale === 'fr' ? 'Erreur lors de la création du compte' : 'Error creating account'));
        }
        setLoading(false);
        return;
      }

      await signIn('credentials', {
        email: form.email.toLowerCase().trim(),
        password: form.password,
        redirect: false,
      });

      router.push(`/${locale}/client/dashboard`);
    } catch {
      setError(locale === 'fr' ? 'Erreur réseau. Veuillez réessayer.' : 'Network error. Please try again.');
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
          <Link href={`/${locale}`}>
            <span style={{
              fontFamily: 'var(--font-cormorant), serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '15px',
              color: '#9a7b2e',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: '18px',
            }}>
              Dog Universe
            </span>
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
            {locale === 'fr' ? 'Pensé pour eux. Fait pour vous.' : 'Designed for them. Made for you.'}
          </h1>
          <p style={{
            fontFamily: 'var(--font-cormorant), serif',
            fontStyle: 'italic',
            fontSize: '15px',
            color: '#a08c5b',
            marginTop: '8px',
          }}>
            {locale === 'fr' ? 'Bienvenue dans l’univers.' : 'Welcome to the universe.'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" style={labelStyle}>
                  {locale === 'fr' ? 'Prénom' : 'First name'}
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={form.firstName}
                  onChange={handleChange}
                  placeholder={locale === 'fr' ? 'Marie' : 'Jane'}
                  required
                  minLength={2}
                  className="du-input mt-1"
                />
              </div>
              <div>
                <label htmlFor="lastName" style={labelStyle}>
                  {locale === 'fr' ? 'Nom' : 'Last name'}
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={form.lastName}
                  onChange={handleChange}
                  placeholder={locale === 'fr' ? 'Dupont' : 'Smith'}
                  required
                  minLength={2}
                  className="du-input mt-1"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" style={labelStyle}>{t('email')}</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="votre@email.com"
                required
                className="du-input mt-1"
              />
            </div>

            <div>
              <label htmlFor="phone" style={labelStyle}>{t('phone')}</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+212 600-000000"
                className="du-input mt-1"
              />
            </div>

            <div>
              <label htmlFor="password" style={labelStyle}>{t('password')}</label>
              <div className="relative mt-1">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
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
              <p style={{
                fontFamily: 'var(--font-dmsans), sans-serif',
                fontSize: '10px',
                color: '#c8b98a',
                marginTop: '5px',
                letterSpacing: '0.02em',
              }}>
                {locale === 'fr'
                  ? '8 caractères minimum · 1 majuscule · 1 minuscule · 1 chiffre'
                  : '8 characters minimum · 1 uppercase · 1 lowercase · 1 digit'}
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" style={labelStyle}>{t('confirmPassword')}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                className="du-input mt-1"
              />
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
                  {locale === 'fr' ? 'Création...' : 'Creating...'}
                </>
              ) : (
                locale === 'fr' ? 'Rejoindre l’univers' : 'Join the universe'
              )}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#a08c5b',
          marginTop: '24px',
          fontFamily: 'var(--font-dmsans), sans-serif',
        }}>
          {locale === 'fr' ? 'Déjà membre ?' : 'Already a member?'}{' '}
          <Link
            href={`/${locale}/auth/login`}
            style={{ color: '#9a7b2e', fontWeight: 500, textDecoration: 'none' }}
          >
            {t('login')}
          </Link>
        </p>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  );
}
