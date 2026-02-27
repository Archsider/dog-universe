'use client';

import { useState } from 'react';
import { Shield, Plus, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Vaccination {
  id: string;
  vaccineType: string;
  date: Date | string;
  comment: string | null;
}

interface VaccinationSectionProps {
  petId: string;
  vaccinations: Vaccination[];
  locale: string;
}

export default function VaccinationSection({ petId, vaccinations: initialVaccinations, locale }: VaccinationSectionProps) {
  const [vaccinations, setVaccinations] = useState(initialVaccinations);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ vaccineType: '', date: '', comment: '' });

  const t = {
    fr: {
      title: 'Vaccinations',
      add: 'Ajouter',
      addTitle: 'Ajouter une vaccination',
      vaccineType: 'Vaccin',
      date: 'Date',
      comment: 'Commentaire / Vétérinaire',
      save: 'Enregistrer',
      cancel: 'Annuler',
      empty: 'Aucune vaccination enregistrée',
      typePlaceholder: 'Ex: Rage, CPHPL...',
      commentPlaceholder: 'Dr. Benali, Clinique Vétérinaire...',
      saving: 'Enregistrement...',
    },
    en: {
      title: 'Vaccinations',
      add: 'Add',
      addTitle: 'Add a vaccination',
      vaccineType: 'Vaccine',
      date: 'Date',
      comment: 'Comment / Veterinarian',
      save: 'Save',
      cancel: 'Cancel',
      empty: 'No vaccinations recorded',
      typePlaceholder: 'E.g: Rabies, DHPP...',
      commentPlaceholder: 'Dr. Smith, Vet Clinic...',
      saving: 'Saving...',
    },
  };

  const labels = t[locale as keyof typeof t] || t.fr;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

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
      setVaccinations(prev => [...prev, data]);
      setShowDialog(false);
      setForm({ vaccineType: '', date: '', comment: '' });
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(locale === 'fr' ? 'Supprimer cette vaccination ?' : 'Delete this vaccination?')) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${id}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== id));
    } catch { /* silent */ }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-gold-500" />
          <h3 className="font-semibold text-charcoal">{labels.title}</h3>
          <span className="text-sm text-gray-500">({vaccinations.length})</span>
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />{labels.add}
        </Button>
      </div>

      {vaccinations.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{labels.empty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vaccinations.map(v => (
            <div key={v.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg border border-ivory-200">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full mt-2 bg-green-400 flex-shrink-0" />
                <div>
                  <p className="font-medium text-charcoal text-sm">{v.vaccineType}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {formatDate(String(v.date))}
                    {v.comment && <span>· {v.comment}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.addTitle}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{labels.vaccineType} *</Label>
              <Input value={form.vaccineType} onChange={e => setForm(f => ({ ...f, vaccineType: e.target.value }))} placeholder={labels.typePlaceholder} className="mt-1" />
            </div>
            <div>
              <Label>{labels.date} *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>{labels.comment}</Label>
              <Textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder={labels.commentPlaceholder} rows={2} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{labels.cancel}</Button>
            <Button onClick={handleSubmit} disabled={loading || !form.vaccineType || !form.date}>
              {loading ? labels.saving : labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
