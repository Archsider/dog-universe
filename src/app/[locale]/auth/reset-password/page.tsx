'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { PawPrint, Loader2, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), locale }),
      });
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          {submitted ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-charcoal font-medium">{t('emailSent')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submit')}
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
