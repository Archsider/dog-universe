'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Vaccination, VaccinationLabels } from '../vaccination-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petId: string;
  labels: VaccinationLabels;
  onAdded: (v: Vaccination) => void;
}

export default function VaccinationFormModal({ open, onOpenChange, petId, labels, onAdded }: Props) {
  const [form, setForm] = useState({ vaccineType: '', date: '', comment: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.vaccineType || !form.date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pets/${petId}/vaccinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccineType: form.vaccineType, date: form.date, comment: form.comment || null }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      onAdded({ ...data, status: 'CONFIRMED', isAutoDetected: false });
      onOpenChange(false);
      setForm({ vaccineType: '', date: '', comment: '' });
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels.addTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{labels.vaccineType} *</Label>
            <Input
              value={form.vaccineType}
              onChange={e => setForm(f => ({ ...f, vaccineType: e.target.value }))}
              placeholder={labels.typePlaceholder}
              className="mt-1"
            />
          </div>
          <div>
            <Label>{labels.date} *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label>{labels.comment}</Label>
            <Textarea
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder={labels.commentPlaceholder}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.vaccineType || !form.date}>
            {loading ? labels.saving : labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
