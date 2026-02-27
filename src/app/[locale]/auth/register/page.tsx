'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { PawPrint, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('errors.weakPassword'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
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
        } else {
          setError(data.message ?? locale === 'fr' ? 'Erreur lors de la création du compte' : 'Error creating account');
        }
        setLoading(false);
        return;
      }

      // Auto-login after registration
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
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 mb-6">
            <PawPrint className="h-7 w-7 text-gold-500" />
            <span className="text-2xl font-serif font-bold text-charcoal">
              Dog <span className="text-gold-500">Universe</span>
            </span>
          </Link>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">{t('title')}</h1>
          <p className="text-charcoal/60 mt-1 text-sm">{t('subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">{t('name')}</Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder={locale === 'fr' ? 'Marie Dupont' : 'Jane Smith'}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="votre@email.com"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+212 600-000000"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                className="mt-1"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {locale === 'fr' ? 'Création...' : 'Creating...'}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-charcoal/60 mt-6">
          {t('hasAccount')}{' '}
          <Link href={`/${locale}/auth/login`} className="text-gold-600 hover:text-gold-700 font-medium">
            {t('login')}
          </Link>
        </p>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
