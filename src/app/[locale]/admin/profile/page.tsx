'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { User, Lock, ShieldCheck, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const labels = {
  fr: {
    title: 'Mon profil',
    adminBadge: 'Administrateur',
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
    adminBadge: 'Administrator',
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

export default function AdminProfilePage() {
  const locale = useLocale();
  const l = labels[locale as keyof typeof labels] || labels.fr;

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

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setForm({ name: data.name || '', phone: data.phone || '' });
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

      {/* Avatar card */}
      <div className="flex items-center gap-4 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-gold-100 text-gold-700 text-xl font-serif">
            {getInitials(profile?.name || profile?.email || 'A')}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-charcoal text-lg">{profile?.name}</p>
          <p className="text-sm text-gray-500">{profile?.email}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-gold-500" />
            <span className="text-xs text-gold-600 font-medium">{l.adminBadge}</span>
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-gold-500" />
          <h2 className="font-semibold text-charcoal">{l.personalInfo}</h2>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {profileError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />{profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg">
              <CheckCircle className="h-4 w-4" />{l.profileSaved}
            </div>
          )}
          <div>
            <Label htmlFor="name">{l.name}</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label>{l.email}</Label>
            <Input value={profile?.email || ''} disabled className="mt-1 bg-ivory-50" />
          </div>
          <div>
            <Label htmlFor="phone">{l.phone}</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="mt-1"
              placeholder="+212 6 00 00 00 00"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saving ? l.saving : l.saveProfile}
          </Button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-gold-500" />
          <h2 className="font-semibold text-charcoal">{l.changePassword}</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />{pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg">
              <CheckCircle className="h-4 w-4" />{l.passwordSaved}
            </div>
          )}
          <div className="relative">
            <Label htmlFor="old-pw">{l.oldPassword}</Label>
            <Input
              id="old-pw"
              type={showOld ? 'text' : 'password'}
              value={pwForm.oldPassword}
              onChange={e => setPwForm(p => ({ ...p, oldPassword: e.target.value }))}
              className="mt-1 pr-10"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              onClick={() => setShowOld(!showOld)}
            >
              {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Label htmlFor="new-pw">{l.newPassword}</Label>
            <Input
              id="new-pw"
              type={showNew ? 'text' : 'password'}
              value={pwForm.newPassword}
              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
              className="mt-1 pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              onClick={() => setShowNew(!showNew)}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div>
            <Label htmlFor="confirm-pw">{l.confirmPassword}</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={pwSaving}>
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {l.savePassword}
          </Button>
        </form>
      </div>
    </div>
  );
}
