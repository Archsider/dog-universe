'use client';

import { useState, useRef } from 'react';
import { FileText, Plus, Trash2, Download, Upload, File, Image } from 'lucide-react';
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
      title: 'Documents',
      upload: 'Ajouter',
      empty: 'Aucun document enregistré',
      emptyHint: 'Carnet de santé, certificat de vaccination, passeport...',
      drag: 'Glissez un fichier ici ou',
      browse: 'parcourir',
      maxSize: '10 Mo max — PDF, JPG, PNG',
      uploading: 'Envoi...',
      download: 'Télécharger',
      delete: 'Supprimer',
      addedOn: 'Ajouté le',
      confirmDelete: 'Supprimer ce document ?',
    },
    en: {
      title: 'Documents',
      upload: 'Add',
      empty: 'No documents recorded',
      emptyHint: 'Health booklet, vaccination certificate, passport...',
      drag: 'Drop a file here or',
      browse: 'browse',
      maxSize: '10 MB max — PDF, JPG, PNG',
      uploading: 'Uploading...',
      download: 'Download',
      delete: 'Delete',
      addedOn: 'Added on',
      confirmDelete: 'Delete this document?',
    },
  };

  const labels = t[locale as keyof typeof t] || t.fr;

  const getIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-8 w-8 text-blue-400" />;
    if (fileType === 'application/pdf') return <FileText className="h-8 w-8 text-red-400" />;
    return <File className="h-8 w-8 text-gray-400" />;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/pets/${petId}/documents`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setDocuments(prev => [...prev, data]);
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gold-500" />
          <h3 className="font-semibold text-charcoal">{labels.title}</h3>
          <span className="text-sm text-gray-500">({documents.length})</span>
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4 mr-1" />{uploading ? labels.uploading : labels.upload}
        </Button>
      </div>

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

      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} className="hidden" />

      {documents.length === 0 ? (
        <div className="text-center py-4 text-gray-400">
          <p className="text-sm">{labels.empty}</p>
          <p className="text-xs mt-0.5">{labels.emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-ivory-50 rounded-lg border border-ivory-200">
              <div className="flex-shrink-0">{getIcon(doc.fileType)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-charcoal truncate">{doc.name}</p>
                <p className="text-xs text-gray-500">{labels.addedOn} {formatDate(String(doc.uploadedAt))}</p>
              </div>
              <div className="flex gap-1">
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-gold-600 rounded" title={labels.download}>
                  <Download className="h-4 w-4" />
                </a>
                <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title={labels.delete}>
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
