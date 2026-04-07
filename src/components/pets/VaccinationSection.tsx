'use client';

import { useState, useRef } from 'react';
import { Shield, Plus, Trash2, Calendar, Upload, ExternalLink, FileText, File } from 'lucide-react';
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

interface PetDocument {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date | string;
}

interface VaccinationSectionProps {
  petId: string;
  vaccinations: Vaccination[];
  documents?: PetDocument[];
  locale: string;
}

const PROOF_PREFIX = 'Preuve vaccination - ';

export default function VaccinationSection({
  petId,
  vaccinations: initialVaccinations,
  documents: initialDocuments = [],
  locale,
}: VaccinationSectionProps) {
  const [vaccinations, setVaccinations] = useState(initialVaccinations);
  const [proofDocs, setProofDocs] = useState(initialDocuments);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ vaccineType: '', date: '', comment: '' });
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const t = {
    fr: {
      title: 'Vaccinations',
      add: 'Ajouter une vaccination',
      addTitle: 'Ajouter une vaccination',
      vaccineType: 'Vaccin',
      date: 'Date',
      comment: 'Commentaire / Vétérinaire',
      save: 'Enregistrer',
      cancel: 'Annuler',
      emptyVax: 'Aucune vaccination enregistrée',
      typePlaceholder: 'Ex: Rage, CPHPL...',
      commentPlaceholder: 'Dr. Benali, Clinique Vétérinaire...',
      saving: 'Enregistrement...',
      proofTitle: 'Justificatifs de vaccination',
      proofSubtitle: 'Vignette · Carnet de vaccination · Passeport animal · Certificat',
      proofUpload: 'Ajouter un justificatif',
      proofUploading: 'Envoi...',
      proofHint: 'PDF, JPG ou PNG · 10 Mo max',
      proofEmpty: 'Aucun justificatif déposé',
      proofView: 'Ouvrir',
      proofDelete: 'Supprimer',
      proofConfirmDelete: 'Supprimer ce justificatif ?',
    },
    en: {
      title: 'Vaccinations',
      add: 'Add vaccination',
      addTitle: 'Add a vaccination',
      vaccineType: 'Vaccine',
      date: 'Date',
      comment: 'Comment / Veterinarian',
      save: 'Save',
      cancel: 'Cancel',
      emptyVax: 'No vaccinations recorded',
      typePlaceholder: 'E.g: Rabies, DHPP...',
      commentPlaceholder: 'Dr. Smith, Vet Clinic...',
      saving: 'Saving...',
      proofTitle: 'Vaccination proof',
      proofSubtitle: 'Sticker · Health booklet · Pet passport · Certificate',
      proofUpload: 'Add proof',
      proofUploading: 'Uploading...',
      proofHint: 'PDF, JPG or PNG · 10 MB max',
      proofEmpty: 'No proof uploaded',
      proofView: 'Open',
      proofDelete: 'Delete',
      proofConfirmDelete: 'Delete this file?',
    },
  };

  const labels = t[locale as keyof typeof t] || t.fr;

  const fmtDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const displayName = (doc: PetDocument) =>
    doc.name.startsWith(PROOF_PREFIX) ? doc.name.slice(PROOF_PREFIX.length) : doc.name;

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

  const handleDeleteVax = async (id: string) => {
    if (!confirm(locale === 'fr' ? 'Supprimer cette vaccination ?' : 'Delete this vaccination?')) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${id}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== id));
    } catch { /* silent */ }
  };

  const handleProofUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    setProofUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', `${PROOF_PREFIX}${file.name}`);
      const res = await fetch(`/api/pets/${petId}/documents`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed');
      const data: PetDocument = await res.json();
      setProofDocs(prev => [data, ...prev]);
    } catch { /* silent */ } finally {
      setProofUploading(false);
    }
  };

  const handleDeleteProof = async (docId: string) => {
    if (!confirm(labels.proofConfirmDelete)) return;
    try {
      await fetch(`/api/pets/${petId}/documents?documentId=${docId}`, { method: 'DELETE' });
      setProofDocs(prev => prev.filter(d => d.id !== docId));
    } catch { /* silent */ }
  };

  const ProofIcon = ({ fileType }: { fileType: string }) => {
    if (fileType === 'application/pdf') return <FileText className="h-5 w-5 text-red-400 flex-shrink-0" />;
    return <File className="h-5 w-5 text-blue-400 flex-shrink-0" />;
  };

  return (
    <div className="space-y-6">
      {/* ── Vaccination entries ── */}
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
          <div className="text-center py-6 text-gray-400">
            <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{labels.emptyVax}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vaccinations
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(v => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg border border-ivory-200">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full mt-2 bg-green-400 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-charcoal text-sm">{v.vaccineType}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(String(v.date))}
                        {v.comment && <span>· {v.comment}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteVax(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Vaccination proof files ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="font-semibold text-amber-900 text-sm">{labels.proofTitle}</p>
            <p className="text-xs text-amber-700 mt-0.5">{labels.proofSubtitle}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 text-xs gap-1.5 flex-shrink-0"
            disabled={proofUploading}
            onClick={() => proofInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {proofUploading ? labels.proofUploading : labels.proofUpload}
          </Button>
          <input
            ref={proofInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); e.target.value = ''; }}
          />
        </div>

        {/* Format hint */}
        <p className="text-xs text-amber-600 mb-3">{labels.proofHint}</p>

        {/* Proof file list */}
        {proofDocs.length === 0 ? (
          <p className="text-xs text-amber-700/60 italic">{labels.proofEmpty}</p>
        ) : (
          <div className="space-y-2 mt-2">
            {proofDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 px-3 py-2">
                {/* Thumbnail for images, icon for others */}
                {doc.fileType.startsWith('image/') ? (
                  <img
                    src={doc.fileUrl}
                    alt={displayName(doc)}
                    className="h-8 w-8 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <ProofIcon fileType={doc.fileType} />
                )}
                <span className="flex-1 min-w-0 text-xs font-medium text-charcoal truncate">
                  {displayName(doc)}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                  {fmtDate(String(doc.uploadedAt))}
                </span>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium flex-shrink-0 px-1.5 py-1 rounded hover:bg-amber-100"
                  title={labels.proofView}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{labels.proofView}</span>
                </a>
                <button
                  onClick={() => handleDeleteProof(doc.id)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
                  title={labels.proofDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add vaccination dialog ── */}
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
