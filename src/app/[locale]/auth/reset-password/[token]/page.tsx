'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Image from 'next/image';

export default function ResetPasswordConfirmPage() {
  const t = useTranslations('auth.resetPassword');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(locale === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError(locale === 'fr' ? 'Le mot de passe doit contenir au moins 8 caractères.' : 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'TOKEN_EXPIRED') {
          setError(t('tokenExpired'));
        } else {
          setError(locale === 'fr' ? 'Une erreur est survenue.' : 'An error occurred.');
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(`/${locale}/auth/login`), 3000);
    } catch {
      setError(locale === 'fr' ? 'Une erreur est survenue.' : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-block mb-6">
            <Image src="/logo.png" alt="Dog Universe" width={160} height={44} className="h-12 w-auto object-contain mx-auto" priority />
          </Link>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">{t('newTitle')}</h1>
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-charcoal font-medium">{t('success')}</p>
              <p className="text-charcoal/60 text-sm mt-2">
                {locale === 'fr' ? 'Redirection en cours...' : 'Redirecting...'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="password">{t('newPassword')}</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
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

              <div>
                <Label htmlFor="confirm">{t('confirmNewPassword')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('changePassword')}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-charcoal/60 mt-6">
          <Link href={`/${locale}/auth/login`} className="text-gold-600 hover:text-gold-700 font-medium">
            ← {t('backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
