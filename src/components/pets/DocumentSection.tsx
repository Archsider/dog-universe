'use client';

import { useState, useRef } from 'react';
import { FolderOpen, Trash2, Upload, ExternalLink, FileText, File } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PetDocument {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date | string;
}

interface DocumentSectionProps {
  petId: string;
  documents: PetDocument[];
  locale: string;
}

export default function DocumentSection({ petId, documents: initialDocuments, locale }: DocumentSectionProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    fr: {
      title: 'Autres documents',
      subtitle: 'Ordonnances · Résultats d\'analyses · Contrats vétérinaires · Fiches de soins',
      upload: 'Ajouter',
      empty: 'Aucun document',
      emptyHint: 'Ordonnances, résultats d\'analyses, fiches de soins vétérinaires...',
      drag: 'Glissez un fichier ici ou',
      browse: 'parcourir',
      maxSize: '10 Mo max — PDF, JPG, PNG',
      uploading: 'Envoi...',
      open: 'Ouvrir',
      download: 'Télécharger',
      delete: 'Supprimer',
      addedOn: 'Ajouté le',
      confirmDelete: 'Supprimer ce document ?',
    },
    en: {
      title: 'Other documents',
      subtitle: 'Prescriptions · Test results · Vet contracts · Care sheets',
      upload: 'Add',
      empty: 'No documents',
      emptyHint: 'Prescriptions, test results, veterinary care sheets...',
      drag: 'Drop a file here or',
      browse: 'browse',
      maxSize: '10 MB max — PDF, JPG, PNG',
      uploading: 'Uploading...',
      open: 'Open',
      download: 'Download',
      delete: 'Delete',
      addedOn: 'Added on',
      confirmDelete: 'Delete this document?',
    },
  };

  const labels = t[locale as keyof typeof t] || t.fr;

  const fmtDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/pets/${petId}/documents`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setDocuments(prev => [data, ...prev]);
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm(labels.confirmDelete)) return;
    try {
      await fetch(`/api/pets/${petId}/documents?documentId=${docId}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch { /* silent */ }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-gold-500" />
            <h3 className="font-semibold text-charcoal">{labels.title}</h3>
            <span className="text-sm text-gray-500">({documents.length})</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-7">{labels.subtitle}</p>
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-shrink-0">
          <Upload className="h-4 w-4 mr-1" />{uploading ? labels.uploading : labels.upload}
        </Button>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center mb-4 cursor-pointer transition-colors ${dragOver ? 'border-gold-400 bg-gold-50' : 'border-ivory-300 hover:border-gold-300'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-6 w-6 mx-auto mb-1 text-gray-400" />
        <p className="text-sm text-gray-500">{labels.drag} <span className="text-gold-600 font-medium">{labels.browse}</span></p>
        <p className="text-xs text-gray-400 mt-0.5">{labels.maxSize}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
      />

      {/* File list */}
      {documents.length === 0 ? (
        <div className="text-center py-4 text-gray-400">
          <p className="text-sm">{labels.empty}</p>
          <p className="text-xs mt-0.5 text-gray-300">{labels.emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-ivory-50 rounded-lg border border-ivory-200">
              {/* Thumbnail for images, icon for others */}
              {doc.fileType.startsWith('image/') ? (
                <img
                  src={doc.fileUrl}
                  alt={doc.name}
                  className="h-10 w-10 object-cover rounded flex-shrink-0"
                />
              ) : doc.fileType === 'application/pdf' ? (
                <FileText className="h-8 w-8 text-red-400 flex-shrink-0" />
              ) : (
                <File className="h-8 w-8 text-gray-400 flex-shrink-0" />
              )}

              {/* Name + date */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-charcoal truncate">{doc.name}</p>
                <p className="text-xs text-gray-400">{labels.addedOn} {fmtDate(String(doc.uploadedAt))}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gold-700 hover:text-gold-900 font-medium px-2 py-1 rounded hover:bg-gold-50 border border-gold-200 hover:border-gold-300 transition-colors"
                  title={labels.open}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{labels.open}</span>
                </a>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  title={labels.delete}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
