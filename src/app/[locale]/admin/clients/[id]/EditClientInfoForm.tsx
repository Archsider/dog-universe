'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  initialFirstName: string;
  initialLastName: string;
  initialEmail: string;
  initialPhone: string | null;
  locale: string;
}

export default function EditClientInfoForm({ clientId, initialFirstName, initialLastName, initialEmail, initialPhone, locale }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [saving, setSaving] = useState(false);

  const l = locale === 'fr'
    ? { edit: 'Modifier', save: 'Enregistrer', cancel: 'Annuler', firstName: 'Prénom', lastName: 'Nom', email: 'Email', phone: 'Téléphone', success: 'Informations mises à jour', errorEmpty: 'Le prénom et le nom sont requis', errorEmail: 'Email invalide', errorTaken: 'Cet email est déjà utilisé', errorGeneric: 'Erreur lors de la mise à jour' }
    : { edit: 'Edit', save: 'Save', cancel: 'Cancel', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', success: 'Info updated', errorEmpty: 'First and last name are required', errorEmail: 'Invalid email', errorTaken: 'Email already in use', errorGeneric: 'Update failed' };

  const handleSave = async () => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast({ title: l.errorEmpty, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'EMAIL_TAKEN') toast({ title: l.errorTaken, variant: 'destructive' });
        else if (data.error === 'Invalid email') toast({ title: l.errorEmail, variant: 'destructive' });
        else toast({ title: l.errorGeneric, variant: 'destructive' });
        return;
      }
      toast({ title: l.success, variant: 'success' });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: l.errorGeneric, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setEmail(initialEmail);
    setPhone(initialPhone ?? '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        className="w-full text-xs gap-1.5"
      >
        <Pencil className="h-3.5 w-3.5" />
        {l.edit}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{l.firstName}</label>
          <Input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="text-sm h-8"
            placeholder={locale === 'fr' ? 'Marie' : 'Jane'}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{l.lastName}</label>
          <Input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="text-sm h-8"
            placeholder={locale === 'fr' ? 'Dupont' : 'Smith'}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{l.email}</label>
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          className="text-sm h-8"
          placeholder="email@example.com"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{l.phone}</label>
        <Input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          type="tel"
          className="text-sm h-8"
          placeholder="+212 600-000000"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {l.save}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving} className="flex-1 text-xs">
          <X className="h-3.5 w-3.5" />
          {l.cancel}
        </Button>
      </div>
    </div>
  );
}
