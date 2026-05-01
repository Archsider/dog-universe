'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { PawPrint, Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function ResetPasswordTokenPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const token = params.token as string;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFr = locale === 'fr';

  const labels = {
    title: isFr ? 'Nouveau mot de passe' : 'New password',
    subtitle: isFr
      ? 'Choisissez un mot de passe sécurisé pour votre compte.'
      : 'Choose a secure password for your account.',
    newPassword: isFr ? 'Nouveau mot de passe' : 'New password',
    confirmPassword: isFr ? 'Confirmer le mot de passe' : 'Confirm password',
    submit: isFr ? 'Réinitialiser le mot de passe' : 'Reset password',
    backToLogin: isFr ? 'Retour à la connexion' : 'Back to login',
    successTitle: isFr ? 'Mot de passe réinitialisé !' : 'Password reset!',
    successMessage: isFr
      ? 'Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.'
      : 'Your password has been updated. You can now log in.',
    loginNow: isFr ? 'Se connecter' : 'Log in',
    errorMismatch: isFr
      ? 'Les mots de passe ne correspondent pas.'
      : 'Passwords do not match.',
    errorTooShort: isFr
      ? 'Le mot de passe doit contenir au moins 8 caractères.'
      : 'Password must be at least 8 characters.',
    errorExpired: isFr
      ? 'Ce lien a expiré ou est invalide. Demandez un nouveau lien.'
      : 'This link has expired or is invalid. Request a new link.',
    errorGeneric: isFr
      ? 'Une erreur est survenue. Veuillez réessayer.'
      : 'An error occurred. Please try again.',
    requestNew: isFr ? 'Demander un nouveau lien' : 'Request a new link',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(labels.errorTooShort);
      return;
    }
    if (password !== confirm) {
      setError(labels.errorMismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push(`/${locale}/auth/login`), 3000);
      } else {
        const data = await res.json();
        if (data.error === 'TOKEN_EXPIRED') {
          setError(labels.errorExpired);
        } else {
          setError(labels.errorGeneric);
        }
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 mb-6">
            <PawPrint className="h-7 w-7 text-gold-500" />
            <span className="text-2xl font-serif font-bold text-charcoal">
              Dog <span className="text-gold-500">Universe</span>
            </span>
          </Link>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">{labels.title}</h1>
          <p className="text-neutral-600 mt-1 text-sm">{labels.subtitle}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-gold p-8">
          {success ? (
            <div className="text-center py-4 space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-charcoal font-medium">{labels.successTitle}</p>
              <p className="text-sm text-neutral-600">{labels.successMessage}</p>
              <Button
                onClick={() => router.push(`/${locale}/auth/login`)}
                className="w-full mt-2"
              >
                {labels.loginNow}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <Label htmlFor="password">{labels.newPassword}</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? (isFr ? 'Masquer le mot de passe' : 'Hide password') : (isFr ? 'Afficher le mot de passe' : 'Show password')}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirm">{labels.confirmPassword}</Label>
                <Input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="mt-1"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : labels.submit}
              </Button>
            </form>
          )}

          {error && (error === labels.errorExpired) && (
            <p className="text-center text-sm text-neutral-600 mt-4">
              <Link
                href={`/${locale}/auth/reset-password`}
                className="text-gold-600 hover:text-gold-700 font-medium"
              >
                {labels.requestNew}
              </Link>
            </p>
          )}
        </div>

        <p className="text-center text-sm text-neutral-600 mt-6">
          <Link href={`/${locale}/auth/login`} className="text-gold-600 hover:text-gold-700 font-medium">
            ← {labels.backToLogin}
          </Link>
        </p>
      </div>
    </main>
  );
}
