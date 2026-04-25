'use client';

import { useState, useRef } from 'react';
import {
  Shield, Plus, Trash2, Calendar, Upload, ExternalLink,
  FileText, File, Sparkles, CheckCircle, AlertCircle, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Vaccination {
  id: string;
  vaccineType: string;
  date: Date | string | null;
  nextDueDate?: Date | string | null;
  comment: string | null;
  status: string; // "CONFIRMED" | "DRAFT"
  isAutoDetected: boolean;
  sourceDocumentId?: string | null;
  _extractionConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  _extractionNote?: string | null;
}

interface PetDocument {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date | string;
}

interface DraftForm {
  vaccineType: string;
  date: string;
  nextDueDate: string;
  comment: string;
}

interface VaccinationSectionProps {
  petId: string;
  vaccinations: Vaccination[];
  documents?: PetDocument[];
  locale: string;
}

export { PROOF_PREFIX } from './constants';
import { PROOF_PREFIX } from './constants';

const T = {
  fr: {
    title: 'Vaccinations',
    add: 'Ajouter',
    addTitle: 'Ajouter une vaccination',
    vaccineType: 'Vaccin',
    date: 'Date d\'administration',
    nextDueDate: 'Date de rappel',
    comment: 'Vétérinaire / Clinique',
    save: 'Enregistrer',
    cancel: 'Annuler',
    saving: 'Enregistrement...',
    typePlaceholder: 'Ex : Rage, CPHPL, Leptospirose…',
    commentPlaceholder: 'Dr. Benali, Clinique Vétérinaire Atlas…',
    nextDuePlaceholder: 'Date de rappel (optionnel)',

    emptyTitle: 'Aucune vaccination enregistrée',
    emptyHint: 'Ajoutez une vaccination manuellement ou déposez un justificatif ci-dessous.',

    proofReceivedTitle: 'Justificatif vaccinal reçu',
    proofReceivedHint: 'Analyse en cours pour créer une fiche de vaccination…',
    proofUnanalyzedHint: (n: number) =>
      n === 1
        ? '1 justificatif en attente d\'analyse'
        : `${n} justificatifs en attente d\'analyse`,
    analyzeBtn: 'Analyser',
    analyzing: 'Analyse en cours…',

    draftBadge: 'À confirmer',
    draftDetectedBadge: 'Détecté automatiquement',
    draftTitle: 'Vaccination détectée — vérifiez et confirmez',
    draftHint: 'Ces informations ont été extraites de votre justificatif. Vérifiez-les avant de confirmer.',
    draftHintManual: 'Justificatif reçu. Saisissez les informations de vaccination pour valider.',
    confirmBtn: 'Confirmer cette vaccination',
    ignoreBtn: 'Ignorer',
    confirming: 'Confirmation…',
    confidenceHigh: 'Données clairement lisibles',
    confidenceMedium: 'Données partiellement lisibles — vérifiez',
    confidenceLow: 'Données peu lisibles — complétez manuellement',

    proofTitle: 'Justificatifs de vaccination',
    proofSubtitle: 'Vignette · Carnet de vaccination · Passeport animal · Certificat',
    proofUpload: 'Ajouter un justificatif',
    proofUploading: 'Envoi…',
    proofHint: 'PDF, JPG ou PNG · 10 Mo max',
    proofEmpty: 'Aucun justificatif déposé',
    proofView: 'Ouvrir',
    proofDelete: 'Supprimer',
    proofConfirmDelete: 'Supprimer ce justificatif ?',
    confirmDeleteVax: 'Supprimer cette vaccination ?',
    confirmDeleteDraft: 'Ignorer ce brouillon de vaccination ?',

    fieldRequired: 'Vaccin et date requis',
  },
  en: {
    title: 'Vaccinations',
    add: 'Add',
    addTitle: 'Add a vaccination',
    vaccineType: 'Vaccine',
    date: 'Administration date',
    nextDueDate: 'Booster / reminder date',
    comment: 'Veterinarian / Clinic',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    typePlaceholder: 'E.g: Rabies, DHPP, Leptospirosis…',
    commentPlaceholder: 'Dr. Smith, City Vet Clinic…',
    nextDuePlaceholder: 'Booster date (optional)',

    emptyTitle: 'No vaccinations recorded',
    emptyHint: 'Add a vaccination manually or upload a proof document below.',

    proofReceivedTitle: 'Vaccination proof received',
    proofReceivedHint: 'Analyzing document to create a vaccination record…',
    proofUnanalyzedHint: (n: number) =>
      n === 1
        ? '1 proof document awaiting analysis'
        : `${n} proof documents awaiting analysis`,
    analyzeBtn: 'Analyze',
    analyzing: 'Analyzing…',

    draftBadge: 'Pending confirmation',
    draftDetectedBadge: 'Auto-detected',
    draftTitle: 'Vaccination detected — please review and confirm',
    draftHint: 'This information was extracted from your proof document. Review before confirming.',
    draftHintManual: 'Proof received. Fill in the vaccination details to confirm.',
    confirmBtn: 'Confirm this vaccination',
    ignoreBtn: 'Ignore',
    confirming: 'Confirming…',
    confidenceHigh: 'Data clearly readable',
    confidenceMedium: 'Data partially readable — please verify',
    confidenceLow: 'Data hard to read — please fill in manually',

    proofTitle: 'Vaccination proof',
    proofSubtitle: 'Sticker · Health booklet · Pet passport · Certificate',
    proofUpload: 'Add proof',
    proofUploading: 'Uploading…',
    proofHint: 'PDF, JPG or PNG · 10 MB max',
    proofEmpty: 'No proof uploaded',
    proofView: 'Open',
    proofDelete: 'Delete',
    proofConfirmDelete: 'Delete this file?',
    confirmDeleteVax: 'Delete this vaccination?',
    confirmDeleteDraft: 'Ignore this vaccination draft?',

    fieldRequired: 'Vaccine name and date are required',
  },
};

export default function VaccinationSection({
  petId,
  vaccinations: initialVaccinations,
  documents: initialDocuments = [],
  locale,
}: VaccinationSectionProps) {
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(initialVaccinations);
  const [proofDocs, setProofDocs] = useState<PetDocument[]>(initialDocuments);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ vaccineType: '', date: '', comment: '' });
  const [proofUploading, setProofUploading] = useState(false);
  const [extractingDocIds, setExtractingDocIds] = useState<Set<string>>(new Set());
  const [draftForms, setDraftForms] = useState<Record<string, DraftForm>>({});
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const proofInputRef = useRef<HTMLInputElement>(null);

  const labels = T[locale as keyof typeof T] || T.fr;

  // ── Derived state ──────────────────────────────────────────────────────────
  const confirmedVax = vaccinations.filter(v => v.status === 'CONFIRMED');
  const draftVax = vaccinations.filter(v => v.status === 'DRAFT');
  const analyzedDocIds = new Set(
    vaccinations.filter(v => v.sourceDocumentId).map(v => v.sourceDocumentId as string)
  );
  const proofDocsWithoutDraft = proofDocs.filter(d => !analyzedDocIds.has(d.id));

  const isEmpty = confirmedVax.length === 0 && draftVax.length === 0 && proofDocs.length === 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtDate = (val: Date | string | null | undefined) => {
    if (!val) return '—';
    return new Date(val).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const toInputDate = (val: Date | string | null | undefined): string => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const displayName = (doc: PetDocument) =>
    doc.name.startsWith(PROOF_PREFIX) ? doc.name.slice(PROOF_PREFIX.length) : doc.name;

  // ── Manual add ─────────────────────────────────────────────────────────────
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
      setVaccinations(prev => [...prev, { ...data, status: 'CONFIRMED', isAutoDetected: false }]);
      setShowDialog(false);
      setForm({ vaccineType: '', date: '', comment: '' });
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  // ── Delete confirmed ────────────────────────────────────────────────────────
  const handleDeleteVax = async (id: string) => {
    if (!confirm(labels.confirmDeleteVax)) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${id}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== id));
    } catch { /* silent */ }
  };

  // ── Upload proof ────────────────────────────────────────────────────────────
  const handleProofUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    setProofUploading(true);
    let doc: PetDocument | null = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', `${PROOF_PREFIX}${file.name}`);
      const res = await fetch(`/api/pets/${petId}/documents`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed');
      doc = await res.json();
      setProofDocs(prev => [doc!, ...prev]);
    } catch {
      setProofUploading(false);
      return;
    }
    setProofUploading(false);

    // Auto-trigger extraction immediately after upload
    if (doc) await triggerExtraction(doc.id);
  };

  // ── AI extraction ───────────────────────────────────────────────────────────
  const triggerExtraction = async (documentId: string) => {
    setExtractingDocIds(prev => new Set(prev).add(documentId));
    try {
      const res = await fetch(`/api/pets/${petId}/vaccinations/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      if (!res.ok) throw new Error('Failed');
      const draft: Vaccination = await res.json();
      setVaccinations(prev => {
        // Avoid duplicates
        if (prev.some(v => v.id === draft.id)) return prev;
        return [...prev, draft];
      });
      // Initialize draft form with extracted values
      setDraftForms(prev => ({
        ...prev,
        [draft.id]: {
          vaccineType: draft.vaccineType ?? '',
          date: toInputDate(draft.date),
          nextDueDate: toInputDate(draft.nextDueDate),
          comment: draft.comment ?? '',
        },
      }));
    } catch { /* extraction failed — proof doc still saved, user sees retry button */ }
    setExtractingDocIds(prev => {
      const next = new Set(prev);
      next.delete(documentId);
      return next;
    });
  };

  // ── Confirm draft ───────────────────────────────────────────────────────────
  const handleConfirmDraft = async (draftId: string) => {
    const f = draftForms[draftId];
    if (!f?.vaccineType?.trim() || !f?.date) return;
    setConfirmingIds(prev => new Set(prev).add(draftId));
    try {
      const res = await fetch(`/api/pets/${petId}/vaccinations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaccinationId: draftId,
          vaccineType: f.vaccineType,
          date: f.date,
          nextDueDate: f.nextDueDate || null,
          comment: f.comment || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated: Vaccination = await res.json();
      setVaccinations(prev => prev.map(v => v.id === draftId ? { ...updated, status: 'CONFIRMED' } : v));
      setDraftForms(prev => { const n = { ...prev }; delete n[draftId]; return n; });
    } catch { /* silent */ } finally {
      setConfirmingIds(prev => { const n = new Set(prev); n.delete(draftId); return n; });
    }
  };

  // ── Dismiss draft ───────────────────────────────────────────────────────────
  const handleDismissDraft = async (draftId: string) => {
    if (!confirm(labels.confirmDeleteDraft)) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${draftId}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== draftId));
      setDraftForms(prev => { const n = { ...prev }; delete n[draftId]; return n; });
    } catch { /* silent */ }
  };

  // ── Delete proof ────────────────────────────────────────────────────────────
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

  const confidenceLabel = (draft: Vaccination) => {
    const conf = draft._extractionConfidence;
    if (!draft.isAutoDetected) return null;
    if (conf === 'HIGH') return { text: labels.confidenceHigh, color: 'text-green-600' };
    if (conf === 'MEDIUM') return { text: labels.confidenceMedium, color: 'text-amber-600' };
    return { text: labels.confidenceLow, color: 'text-orange-600' };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-gold-500" />
          <h3 className="font-semibold text-charcoal">{labels.title}</h3>
          {confirmedVax.length > 0 && (
            <span className="text-sm text-gray-500">({confirmedVax.length})</span>
          )}
          {draftVax.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
              <Clock className="h-3 w-3" />
              {draftVax.length} {labels.draftBadge}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />{labels.add}
        </Button>
      </div>

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="text-center py-8 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <Shield className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">{labels.emptyTitle}</p>
          <p className="text-xs text-gray-400 mt-1">{labels.emptyHint}</p>
        </div>
      )}

      {/* ── Proof-received banner (proof exists but no draft yet, or extraction in progress) ── */}
      {!isEmpty && (extractingDocIds.size > 0 || proofDocsWithoutDraft.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">{labels.proofReceivedTitle}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {extractingDocIds.size > 0
                ? labels.proofReceivedHint
                : labels.proofUnanalyzedHint(proofDocsWithoutDraft.length)}
            </p>
          </div>
          {/* Retry buttons for unanalyzed proofs */}
          {extractingDocIds.size === 0 && proofDocsWithoutDraft.length > 0 && (
            <div className="flex flex-col gap-1 flex-shrink-0">
              {proofDocsWithoutDraft.map(doc => (
                <Button
                  key={doc.id}
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 text-xs h-7 px-2"
                  onClick={() => triggerExtraction(doc.id)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {labels.analyzeBtn}
                </Button>
              ))}
            </div>
          )}
          {extractingDocIds.size > 0 && (
            <span className="text-xs text-amber-700 flex-shrink-0 flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              {labels.analyzing}
            </span>
          )}
        </div>
      )}

      {/* ── Draft vaccination cards ── */}
      {draftVax.length > 0 && (
        <div className="space-y-3">
          {draftVax.map(draft => {
            const f = draftForms[draft.id] ?? {
              vaccineType: draft.vaccineType ?? '',
              date: toInputDate(draft.date),
              nextDueDate: toInputDate(draft.nextDueDate),
              comment: draft.comment ?? '',
            };
            const conf = confidenceLabel(draft);
            const isConfirming = confirmingIds.has(draft.id);
            const canConfirm = f.vaccineType.trim().length > 0 && f.date.length > 0;

            return (
              <div key={draft.id} className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
                {/* Draft header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                      <Clock className="h-3 w-3" />
                      {labels.draftBadge}
                    </span>
                    {draft.isAutoDetected && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
                        <Sparkles className="h-3 w-3" />
                        {labels.draftDetectedBadge}
                      </span>
                    )}
                    {conf && (
                      <span className={`text-xs ${conf.color}`}>{conf.text}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismissDraft(draft.id)}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    {labels.ignoreBtn}
                  </button>
                </div>

                <p className="text-xs text-amber-800 mb-3">
                  {draft.isAutoDetected ? labels.draftHint : labels.draftHintManual}
                </p>

                {/* Editable draft form */}
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.vaccineType} *</Label>
                      <Input
                        value={f.vaccineType}
                        onChange={e => setDraftForms(prev => ({ ...prev, [draft.id]: { ...f, vaccineType: e.target.value } }))}
                        placeholder={labels.typePlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.date} *</Label>
                      <Input
                        type="date"
                        value={f.date}
                        onChange={e => setDraftForms(prev => ({ ...prev, [draft.id]: { ...f, date: e.target.value } }))}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.nextDueDate}</Label>
                      <Input
                        type="date"
                        value={f.nextDueDate}
                        onChange={e => setDraftForms(prev => ({ ...prev, [draft.id]: { ...f, nextDueDate: e.target.value } }))}
                        placeholder={labels.nextDuePlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.comment}</Label>
                      <Input
                        value={f.comment}
                        onChange={e => setDraftForms(prev => ({ ...prev, [draft.id]: { ...f, comment: e.target.value } }))}
                        placeholder={labels.commentPlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleConfirmDraft(draft.id)}
                    disabled={!canConfirm || isConfirming}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isConfirming ? labels.confirming : labels.confirmBtn}
                  </Button>
                  {!canConfirm && (
                    <p className="text-xs text-amber-700 text-center">{labels.fieldRequired}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirmed vaccination entries ── */}
      {confirmedVax.length > 0 && (
        <div className="space-y-2">
          {confirmedVax
            .slice()
            .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
            .map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg border border-ivory-200">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-2 h-2 rounded-full mt-2 bg-green-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal text-sm">{v.vaccineType}</p>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(v.date)}
                      </span>
                      {v.nextDueDate && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <AlertCircle className="h-3 w-3" />
                          Rappel : {fmtDate(v.nextDueDate)}
                        </span>
                      )}
                      {v.comment && <span>· {v.comment}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteVax(v.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* ── Vaccination proof files ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
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

        <p className="text-xs text-amber-600 mb-3">{labels.proofHint}</p>

        {proofDocs.length === 0 ? (
          <p className="text-xs text-amber-700/60 italic">{labels.proofEmpty}</p>
        ) : (
          <div className="space-y-2 mt-2">
            {proofDocs.map(doc => {
              const isExtracting = extractingDocIds.has(doc.id);
              const hasBeenAnalyzed = analyzedDocIds.has(doc.id);
              return (
                <div key={doc.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 px-3 py-2">
                  {doc.fileType.startsWith('image/') ? (
                    <img
                      src={doc.fileUrl}
                      alt={displayName(doc)}
                      className="h-8 w-8 object-cover rounded flex-shrink-0"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <ProofIcon fileType={doc.fileType} />
                  )}
                  <span className="flex-1 min-w-0 text-xs font-medium text-charcoal truncate">
                    {displayName(doc)}
                  </span>
                  {/* Analysis status badge */}
                  {isExtracting && (
                    <span className="text-xs text-amber-600 flex items-center gap-1 flex-shrink-0">
                      <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </span>
                  )}
                  {!isExtracting && hasBeenAnalyzed && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                    {fmtDate(doc.uploadedAt)}
                  </span>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium flex-shrink-0 px-1.5 py-1 rounded hover:bg-amber-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{labels.proofView}</span>
                  </a>
                  <button
                    onClick={() => handleDeleteProof(doc.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add vaccination dialog (manual) ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
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
