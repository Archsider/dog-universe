'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

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

      // Fetch session to get role
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (session?.user?.role === 'ADMIN') {
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
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-block mb-6">
            <Image src="/logo.png" alt="Dog Universe" width={160} height={44} className="h-12 w-auto object-contain mx-auto" priority />
          </Link>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">{t('title')}</h1>
          <p className="text-charcoal/60 mt-1 text-sm">{t('subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                autoComplete="email"
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <Label htmlFor="password">{t('password')}</Label>
                <Link
                  href={`/${locale}/auth/reset-password`}
                  className="text-xs text-gold-600 hover:text-gold-700 transition-colors"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal/70"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {locale === 'fr' ? 'Connexion...' : 'Signing in...'}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </form>

        </div>

        {/* Links */}
        <p className="text-center text-sm text-charcoal/60 mt-6">
          {t('noAccount')}{' '}
          <Link href={`/${locale}/auth/register`} className="text-gold-600 hover:text-gold-700 font-medium">
            {t('register')}
          </Link>
        </p>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
