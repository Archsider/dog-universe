'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string | null;
  locale: string;
}

export default function EditClientInfoForm({ clientId, initialName, initialEmail, initialPhone, locale }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [saving, setSaving] = useState(false);

  const l = locale === 'fr'
    ? { edit: 'Modifier', save: 'Enregistrer', cancel: 'Annuler', name: 'Nom complet', email: 'Email', phone: 'Téléphone', success: 'Informations mises à jour', errorEmpty: 'Le nom ne peut pas être vide', errorEmail: 'Email invalide', errorTaken: 'Cet email est déjà utilisé', errorGeneric: 'Erreur lors de la mise à jour' }
    : { edit: 'Edit', save: 'Save', cancel: 'Cancel', name: 'Full name', email: 'Email', phone: 'Phone', success: 'Info updated', errorEmpty: 'Name cannot be empty', errorEmail: 'Invalid email', errorTaken: 'Email already in use', errorGeneric: 'Update failed' };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: l.errorEmpty, variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || null }),
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
    setName(initialName);
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
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{l.name}</label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="text-sm h-8"
          placeholder="Prénom Nom"
        />
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
