'use client';

import { useRef, useState } from 'react';
import { Upload, ExternalLink, FileText, File, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PROOF_PREFIX } from '../constants';
import { dateLocaleFor } from '@/lib/date-locale';
import type { PetDocument, VaccinationLabels } from '../vaccination-types';

interface Props {
  petId: string;
  proofDocs: PetDocument[];
  extractingDocIds: Set<string>;
  analyzedDocIds: Set<string>;
  locale: string;
  labels: VaccinationLabels;
  onDocAdded: (doc: PetDocument) => void;
  onDocDeleted: (docId: string) => void;
  onTriggerExtraction: (documentId: string) => Promise<void>;
}

function ProofIcon({ fileType }: { fileType: string }) {
  if (fileType === 'application/pdf') return <FileText className="h-5 w-5 text-red-400 flex-shrink-0" />;
  return <File className="h-5 w-5 text-blue-400 flex-shrink-0" />;
}

function fmtDate(val: Date | string, locale: string) {
  return new Date(val).toLocaleDateString(dateLocaleFor(locale), {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function VaccinationDocumentList({
  petId, proofDocs, extractingDocIds, analyzedDocIds,
  locale, labels, onDocAdded, onDocDeleted, onTriggerExtraction,
}: Props) {
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const displayName = (doc: PetDocument) =>
    doc.name.startsWith(PROOF_PREFIX) ? doc.name.slice(PROOF_PREFIX.length) : doc.name;

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
      onDocAdded(doc!);
    } catch {
      setProofUploading(false);
      return;
    }
    setProofUploading(false);
    if (doc) await onTriggerExtraction(doc.id);
  };

  const handleDeleteProof = async (docId: string) => {
    if (!confirm(labels.proofConfirmDelete)) return;
    try {
      await fetch(`/api/pets/${petId}/documents?documentId=${docId}`, { method: 'DELETE' });
      onDocDeleted(docId);
    } catch { /* silent */ }
  };

  return (
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
                {isExtracting && (
                  <span className="text-xs text-amber-600 flex items-center gap-1 flex-shrink-0">
                    <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </span>
                )}
                {!isExtracting && hasBeenAnalyzed && (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                  {fmtDate(doc.uploadedAt, locale)}
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
                  aria-label={
                    locale === 'ar' ? 'حذف المستند'
                    : locale === 'fr' ? 'Supprimer le justificatif'
                    : 'Delete proof document'
                  }
                  className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
