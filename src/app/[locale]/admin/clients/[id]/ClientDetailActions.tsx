'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Plus, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  currentGrade: string;
  locale: string;
  phone?: string | null;
  isWalkIn?: boolean;
}

type SmsType = 'INCOMPLETE_FILE' | 'MISSING_VACCINES' | 'CONTRACT_REMINDER';

export default function ClientDetailActions({ clientId, currentGrade, locale, phone, isWalkIn }: Props) {
  const [grade, setGrade] = useState(currentGrade);
  const [savingGrade, setSavingGrade] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // SMS state
  const [smsType, setSmsType] = useState<SmsType | null>(null);
  const [smsNote, setSmsNote] = useState('');
  const [sendingSms, setSendingSms] = useState<SmsType | null>(null);

  const labels = {
    fr: {
      override: 'Modifier le grade', save: 'Enregistrer',
      addNote: 'Ajouter une note', notePlaceholder: 'Note interne...',
      success: 'Enregistré !', error: 'Erreur',
      smsTitle: 'Envoyer un SMS',
      smsIncomplete: '📋 Dossier incomplet',
      smsVaccines: '💉 Vaccins manquants',
      smsContract: '📝 Rappel contrat',
      smsSent: 'SMS envoyé ✅',
      smsNoPhone: 'Pas de numéro',
      smsWalkIn: 'Client de passage — SMS non disponible',
      smsNotePlaceholder: 'Motif (optionnel)',
      smsPetPlaceholder: 'Nom de l\'animal (optionnel)',
      smsConfirm: 'Envoyer',
      smsCancel: 'Annuler',
    },
    en: {
      override: 'Override grade', save: 'Save',
      addNote: 'Add note', notePlaceholder: 'Internal note...',
      success: 'Saved!', error: 'Error',
      smsTitle: 'Send SMS',
      smsIncomplete: '📋 Incomplete file',
      smsVaccines: '💉 Missing vaccines',
      smsContract: '📝 Contract reminder',
      smsSent: 'SMS sent ✅',
      smsNoPhone: 'No phone number',
      smsWalkIn: 'Walk-in client — SMS not available',
      smsNotePlaceholder: 'Reason (optional)',
      smsPetPlaceholder: 'Pet name (optional)',
      smsConfirm: 'Send',
      smsCancel: 'Cancel',
    },
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

  const smsDisabled = isWalkIn || !phone;
  const smsDisabledReason = isWalkIn ? l.smsWalkIn : !phone ? l.smsNoPhone : '';

  const sendSmsNow = async (type: SmsType, payloadNote?: string) => {
    setSendingSms(type);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, note: payloadNote?.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed');
      }
      toast({ title: l.smsSent, variant: 'success' });
      setSmsType(null);
      setSmsNote('');
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : l.error, variant: 'destructive' });
    } finally {
      setSendingSms(null);
    }
  };

  const SmsButton = ({ type, label }: { type: SmsType; label: string }) => {
    const needsInput = type !== 'CONTRACT_REMINDER';
    const isActive = smsType === type;
    const isSending = sendingSms === type;

    if (isActive && needsInput) {
      return (
        <div className="space-y-2">
          <Textarea
            value={smsNote}
            onChange={e => setSmsNote(e.target.value)}
            placeholder={type === 'MISSING_VACCINES' ? l.smsPetPlaceholder : l.smsNotePlaceholder}
            rows={2}
            className="text-sm"
            maxLength={200}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => sendSmsNow(type, smsNote)}
              disabled={isSending}
              className="flex-1"
            >
              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              {l.smsConfirm}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSmsType(null); setSmsNote(''); }}
              disabled={isSending}
            >
              {l.smsCancel}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          if (smsDisabled || isSending) return;
          if (needsInput) {
            setSmsType(type);
            setSmsNote('');
          } else {
            sendSmsNow(type);
          }
        }}
        disabled={smsDisabled || isSending}
        title={smsDisabled ? smsDisabledReason : label}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#C4974A]"
      >
        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        <span>{label}</span>
      </button>
    );
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

      {/* ─── SMS section ───────────────────────────────────────────────────── */}
      <div className="border-t border-ivory-200 pt-3">
        <p className="text-xs font-semibold text-[#8A7E75] uppercase tracking-wider mb-2">{l.smsTitle}</p>
        <div className="space-y-2">
          <SmsButton type="INCOMPLETE_FILE" label={l.smsIncomplete} />
          <SmsButton type="MISSING_VACCINES" label={l.smsVaccines} />
          <SmsButton type="CONTRACT_REMINDER" label={l.smsContract} />
        </div>
      </div>
    </div>
  );
}
