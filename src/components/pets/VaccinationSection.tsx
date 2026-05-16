'use client';

// Orchestrator only — owns the state + I/O for vaccinations on a pet :
//   - VaccinationViewList     : display of draft cards + confirmed list
//   - VaccinationFormModal    : "Add a vaccination" dialog
//   - VaccinationDocumentList : upload + delete proof documents
//
// Triggers extraction via `/api/pets/:id/vaccinations/extract` whenever a
// new proof is uploaded. The Claude Haiku extraction creates a DRAFT
// vaccination row that the operator can review and confirm in-line.

import { useState } from 'react';
import { Shield, Plus, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VaccinationFormModal from './vaccination/VaccinationFormModal';
import VaccinationDocumentList from './vaccination/VaccinationDocumentList';
import VaccinationViewList from './vaccination/VaccinationViewList';
import type { Vaccination, PetDocument, DraftForm, VaccinationLabels } from './vaccination-types';

export { PROOF_PREFIX } from './constants';

interface VaccinationSectionProps {
  petId: string;
  vaccinations: Vaccination[];
  documents?: PetDocument[];
  locale: string;
}

const T: Record<string, VaccinationLabels> = {
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
      n === 1 ? '1 justificatif en attente d\'analyse' : `${n} justificatifs en attente d\'analyse`,
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
      n === 1 ? '1 proof document awaiting analysis' : `${n} proof documents awaiting analysis`,
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

const toInputDate = (val: Date | string | null | undefined): string => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
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
  const [extractingDocIds, setExtractingDocIds] = useState<Set<string>>(new Set());
  const [draftForms, setDraftForms] = useState<Record<string, DraftForm>>({});
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());

  const labels = T[locale] ?? T.fr;

  const confirmedVax = vaccinations.filter(v => v.status === 'CONFIRMED');
  const draftVax = vaccinations.filter(v => v.status === 'DRAFT');
  const analyzedDocIds = new Set<string>(
    vaccinations.filter(v => v.sourceDocumentId).map(v => v.sourceDocumentId as string)
  );
  const proofDocsWithoutDraft = proofDocs.filter(d => !analyzedDocIds.has(d.id));
  const isEmpty = confirmedVax.length === 0 && draftVax.length === 0 && proofDocs.length === 0;

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
      setVaccinations(prev => prev.some(v => v.id === draft.id) ? prev : [...prev, draft]);
      setDraftForms(prev => ({
        ...prev,
        [draft.id]: {
          vaccineType: draft.vaccineType ?? '',
          date: toInputDate(draft.date),
          nextDueDate: toInputDate(draft.nextDueDate),
          comment: draft.comment ?? '',
        },
      }));
    } catch { /* proof doc still saved, user sees retry button */ }
    setExtractingDocIds(prev => { const n = new Set(prev); n.delete(documentId); return n; });
  };

  const handleDeleteVax = async (id: string) => {
    if (!confirm(labels.confirmDeleteVax)) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${id}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== id));
    } catch { /* silent */ }
  };

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

  const handleDismissDraft = async (draftId: string) => {
    if (!confirm(labels.confirmDeleteDraft)) return;
    try {
      await fetch(`/api/pets/${petId}/vaccinations?vaccinationId=${draftId}`, { method: 'DELETE' });
      setVaccinations(prev => prev.filter(v => v.id !== draftId));
      setDraftForms(prev => { const n = { ...prev }; delete n[draftId]; return n; });
    } catch { /* silent */ }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
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

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-8 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <Shield className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">{labels.emptyTitle}</p>
          <p className="text-xs text-gray-400 mt-1">{labels.emptyHint}</p>
        </div>
      )}

      {/* Proof-received banner */}
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

      {/* Drafts + confirmed list */}
      <VaccinationViewList
        confirmedVax={confirmedVax}
        draftVax={draftVax}
        draftForms={draftForms}
        confirmingIds={confirmingIds}
        locale={locale}
        labels={labels}
        onUpdateDraftForm={(draftId, form) => setDraftForms(prev => ({ ...prev, [draftId]: form }))}
        onConfirmDraft={handleConfirmDraft}
        onDismissDraft={handleDismissDraft}
        onDeleteVax={handleDeleteVax}
      />

      {/* Proof documents */}
      <VaccinationDocumentList
        petId={petId}
        proofDocs={proofDocs}
        extractingDocIds={extractingDocIds}
        analyzedDocIds={analyzedDocIds}
        locale={locale}
        labels={labels}
        onDocAdded={doc => setProofDocs(prev => [doc, ...prev])}
        onDocDeleted={docId => setProofDocs(prev => prev.filter(d => d.id !== docId))}
        onTriggerExtraction={triggerExtraction}
      />

      {/* Add vaccination modal */}
      <VaccinationFormModal
        open={showDialog}
        onOpenChange={setShowDialog}
        petId={petId}
        labels={labels}
        onAdded={v => setVaccinations(prev => [...prev, v])}
      />
    </div>
  );
}
