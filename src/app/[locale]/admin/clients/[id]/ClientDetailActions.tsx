'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  currentGrade: string;
  locale: string;
}

export default function ClientDetailActions({ clientId, currentGrade, locale }: Props) {
  const [grade, setGrade] = useState(currentGrade);
  const [savingGrade, setSavingGrade] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const labels = {
    fr: { override: 'Modifier le grade', overrideGrade: 'Forcer le grade', save: 'Enregistrer', addNote: 'Ajouter une note', notePlaceholder: 'Note interne...', success: 'Enregistré !', error: 'Erreur' },
    en: { override: 'Override grade', overrideGrade: 'Force grade', save: 'Save', addNote: 'Add note', notePlaceholder: 'Internal note...', success: 'Saved!', error: 'Error' },
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
