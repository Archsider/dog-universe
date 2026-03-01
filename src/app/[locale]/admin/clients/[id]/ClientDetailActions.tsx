'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Plus, ShieldCheck, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  currentGrade: string;
  currentRole: string;
  locale: string;
}

export default function ClientDetailActions({ clientId, currentGrade, currentRole, locale }: Props) {
  const [grade, setGrade] = useState(currentGrade);
  const [savingGrade, setSavingGrade] = useState(false);
  const [role, setRole] = useState(currentRole);
  const [savingRole, setSavingRole] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const labels = {
    fr: { override: 'Modifier le grade', save: 'Enregistrer', addNote: 'Ajouter une note', notePlaceholder: 'Note interne...', success: 'Enregistré !', error: 'Erreur', role: 'Rôle du compte', roleSuccess: 'Rôle mis à jour !' },
    en: { override: 'Override grade', save: 'Save', addNote: 'Add note', notePlaceholder: 'Internal note...', success: 'Saved!', error: 'Error', role: 'Account role', roleSuccess: 'Role updated!' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  const handleSaveGrade = async () => {
    setSavingGrade(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/loyalty`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setSavingGrade(false);
    }
  };

  const handleSaveRole = async () => {
    setSavingRole(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.roleSuccess, variant: 'success' });
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setSavingRole(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: note, entityType: 'CLIENT', entityId: clientId }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
      setNote('');
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="flex-1 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map(g => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleSaveGrade} disabled={savingGrade || grade === currentGrade}>
          {savingGrade ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>

      <div className="border-t border-ivory-200 pt-3">
        <p className="text-xs font-semibold text-gray-500 mb-2">{l.role}</p>
        <div className="flex gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CLIENT">
                <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Client</span>
              </SelectItem>
              <SelectItem value="ADMIN">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-gold-600" /> Admin</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleSaveRole} disabled={savingRole || role === currentRole} variant={role === 'ADMIN' ? 'default' : 'outline'}>
            {savingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="border-t border-ivory-200 pt-3">
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={l.notePlaceholder}
          rows={2}
          className="text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleAddNote} disabled={savingNote || !note.trim()} className="mt-2 w-full">
          {savingNote ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {l.addNote}
        </Button>
      </div>
    </div>
  );
}
