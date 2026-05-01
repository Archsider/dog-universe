'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { User, Lock, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, FileText, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import RgpdSection from './RgpdSection';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface ContractInfo {
  id: string;
  signedAt: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  version: string;
}

export default function ProfilePage() {
  const locale = useLocale();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [pwError, setPwError] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [form, setForm] = useState({ name: '', phone: '' });
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [contractError, setContractError] = useState('');

  const labels = {
    fr: {
      title: 'Mon profil',
      personalInfo: 'Informations personnelles',
      name: 'Nom complet',
      email: 'Email',
      phone: 'Téléphone',
      saveProfile: 'Enregistrer',
      saving: 'Enregistrement...',
      profileSaved: 'Profil mis à jour !',
      changePassword: 'Changer le mot de passe',
      oldPassword: 'Mot de passe actuel',
      newPassword: 'Nouveau mot de passe',
      confirmPassword: 'Confirmer le nouveau mot de passe',
      savePassword: 'Mettre à jour',
      passwordSaved: 'Mot de passe mis à jour !',
      passwordMismatch: 'Les mots de passe ne correspondent pas',
      passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
      error: 'Une erreur s\'est produite',
    },
    en: {
      title: 'My profile',
      personalInfo: 'Personal information',
      name: 'Full name',
      email: 'Email',
      phone: 'Phone',
      saveProfile: 'Save',
      saving: 'Saving...',
      profileSaved: 'Profile updated!',
      changePassword: 'Change password',
      oldPassword: 'Current password',
      newPassword: 'New password',
      confirmPassword: 'Confirm new password',
      savePassword: 'Update',
      passwordSaved: 'Password updated!',
      passwordMismatch: 'Passwords do not match',
      passwordTooShort: 'Password must be at least 8 characters',
      error: 'An error occurred',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then(r => r.json()),
      fetch('/api/contracts/sign').then(r => r.json()),
    ]).then(([profileData, contractData]) => {
      setProfile(profileData);
      setForm({ name: profileData.name || '', phone: profileData.phone || '' });
      if (contractData.contract) setContract(contractData.contract);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileError('');
    setProfileSuccess(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed');
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileError(l.error);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadContract = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!contract) return;
    const buffer = 60_000; // 60s buffer before expiry — avoids tail-end races
    const fresh = !!(
      contract.downloadUrl &&
      contract.expiresAt &&
      new Date(contract.expiresAt).getTime() > Date.now() + buffer
    );
    if (fresh) return; // Let browser follow the existing href in a new tab

    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    setContractError('');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`/api/contracts/${contract.id}/signed-url`, {
        signal: controller.signal,
      });
      if (res.status === 401) {
        window.location.href = `/${locale}/auth/login?next=/${locale}/client/profile`;
        return;
      }
      if (!res.ok) {
        setContractError(
          locale === 'fr'
            ? 'Document temporairement indisponible — réessayez dans quelques minutes.'
            : 'Document temporarily unavailable — please retry in a few minutes.',
        );
        return;
      }
      const data = (await res.json()) as { url: string; expiresAt: string };
      setContract({ ...contract, downloadUrl: data.url, expiresAt: data.expiresAt });
      window.location.assign(data.url);
    } catch {
      setContractError(
        locale === 'fr'
          ? 'Document temporairement indisponible — réessayez dans quelques minutes.'
          : 'Document temporarily unavailable — please retry in a few minutes.',
      );
    } finally {
      clearTimeout(timer);
      setDownloading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (pwForm.newPassword.length < 8) { setPwError(l.passwordTooShort); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError(l.passwordMismatch); return; }
    setPwSaving(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setPwSuccess(true);
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : l.error);
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>

      <div className="flex items-center gap-4 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-gold-100 text-gold-700 text-xl font-serif">
            {getInitials(profile?.name || profile?.email || 'U')}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-charcoal text-lg">{profile?.name}</p>
          <p className="text-sm text-gray-500">{profile?.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-gold-500" />
          <h2 className="font-semibold text-charcoal">{l.personalInfo}</h2>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {profileError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="h-4 w-4" />{profileError}</div>}
          {profileSuccess && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg"><CheckCircle className="h-4 w-4" />{l.profileSaved}</div>}
          <div>
            <Label htmlFor="name">{l.name}</Label>
            <Input id="name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{l.email}</Label>
            <Input value={profile?.email || ''} disabled className="mt-1 bg-ivory-50" />
          </div>
          <div>
            <Label htmlFor="phone">{l.phone}</Label>
            <Input id="phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1" placeholder="+212 6 00 00 00 00" />
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saving ? l.saving : l.saveProfile}
          </Button>
        </form>
      </div>

      {/* Contract section */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-gold-500" />
          <h2 className="font-semibold text-charcoal">
            {locale === 'fr' ? 'Contrat de pension' : 'Boarding contract'}
          </h2>
        </div>
        {contract ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-green-800">
                  {locale === 'fr' ? 'Contrat signé' : 'Contract signed'}
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  {locale === 'fr' ? 'Le' : 'On'}{' '}
                  {new Date(contract.signedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                  {' — '}v{contract.version}
                </p>
              </div>
              <a
                href={contract.downloadUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDownloadContract}
                aria-busy={downloading}
                aria-disabled={downloading}
                className={`flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-900 underline ${downloading ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {locale === 'fr' ? 'Télécharger' : 'Download'}
              </a>
            </div>
            {contractError && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                {contractError}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {locale === 'fr'
              ? 'Aucun contrat signé. Vous serez invité à signer à votre prochaine connexion.'
              : 'No contract signed yet. You will be prompted to sign on your next login.'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-gold-500" />
          <h2 className="font-semibold text-charcoal">{l.changePassword}</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="h-4 w-4" />{pwError}</div>}
          {pwSuccess && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg"><CheckCircle className="h-4 w-4" />{l.passwordSaved}</div>}
          <div className="relative">
            <Label htmlFor="old-pw">{l.oldPassword}</Label>
            <Input id="old-pw" type={showOld ? 'text' : 'password'} value={pwForm.oldPassword} onChange={e => setPwForm(p => ({ ...p, oldPassword: e.target.value }))} className="mt-1 pr-10" required />
            <button type="button" aria-label={showOld ? (locale === 'fr' ? 'Masquer le mot de passe' : 'Hide password') : (locale === 'fr' ? 'Afficher le mot de passe' : 'Show password')} className="absolute right-3 top-8 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded" onClick={() => setShowOld(!showOld)}>{showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <div className="relative">
            <Label htmlFor="new-pw">{l.newPassword}</Label>
            <Input id="new-pw" type={showNew ? 'text' : 'password'} value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} className="mt-1 pr-10" required minLength={8} />
            <button type="button" aria-label={showNew ? (locale === 'fr' ? 'Masquer le mot de passe' : 'Hide password') : (locale === 'fr' ? 'Afficher le mot de passe' : 'Show password')} className="absolute right-3 top-8 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded" onClick={() => setShowNew(!showNew)}>{showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <div>
            <Label htmlFor="confirm-pw">{l.confirmPassword}</Label>
            <Input id="confirm-pw" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} className="mt-1" required />
          </div>
          <Button type="submit" variant="outline" disabled={pwSaving}>
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {l.savePassword}
          </Button>
        </form>
      </div>

      <RgpdSection locale={locale} />
    </div>
  );
}
