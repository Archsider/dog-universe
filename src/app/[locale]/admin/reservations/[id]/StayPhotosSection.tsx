'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import Image from 'next/image';

interface StayPhoto {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
}

interface Props {
  bookingId: string;
  locale: string;
}

const l = {
  fr: {
    title: 'Photos de séjour',
    upload: 'Ajouter une photo',
    caption: 'Légende (optionnel)',
    captionPlaceholder: 'Ex : Luna profite du jardin !',
    send: 'Publier',
    noPhotos: 'Aucune photo publiée',
    delete: 'Supprimer',
    notifSent: 'Photo publiée et client notifié',
    error: 'Erreur',
    uploading: 'Publication...',
  },
  en: {
    title: 'Stay photos',
    upload: 'Add a photo',
    caption: 'Caption (optional)',
    captionPlaceholder: 'E.g. Luna enjoying the garden!',
    send: 'Publish',
    noPhotos: 'No photos published yet',
    delete: 'Delete',
    notifSent: 'Photo published and client notified',
    error: 'Error',
    uploading: 'Publishing...',
  },
};

export default function StayPhotosSection({ bookingId, locale }: Props) {
  const labels = l[locale as keyof typeof l] || l.fr;
  const [photos, setPhotos] = useState<StayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/admin/bookings/${bookingId}/photos`)
      .then(r => r.json())
      .then(data => { setPhotos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookingId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (caption.trim()) fd.append('caption', caption.trim());

      const res = await fetch(`/api/admin/bookings/${bookingId}/photos`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const photo = await res.json();
      setPhotos(prev => [photo, ...prev]);
      setSelectedFile(null);
      setPreview(null);
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: labels.notifSent, variant: 'success' });
    } catch {
      toast({ title: labels.error, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    try {
      await fetch(`/api/admin/bookings/${bookingId}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch {
      toast({ title: labels.error, variant: 'destructive' });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Camera className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{labels.title}</h3>
      </div>

      {/* Upload zone */}
      <div className="space-y-3 mb-4">
        {preview ? (
          <div className="relative rounded-lg overflow-hidden border border-[#F0D98A]/40">
            <Image src={preview} alt="preview" width={400} height={200} className="w-full h-40 object-cover" />
            <button
              onClick={() => { setPreview(null); setSelectedFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-[#F0D98A] rounded-lg p-4 text-center text-sm text-gray-400 hover:border-gold-400 hover:text-gold-600 transition-colors"
          >
            <Upload className="h-5 w-5 mx-auto mb-1" />
            {labels.upload}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {preview && (
          <>
            <Input
              placeholder={labels.captionPlaceholder}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="text-sm"
            />
            <Button onClick={handleUpload} disabled={uploading} size="sm" className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {uploading ? labels.uploading : labels.send}
            </Button>
          </>
        )}
      </div>

      {/* Photos grid */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gold-400" /></div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">{labels.noPhotos}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-[#F0D98A]/30">
              <Image src={photo.url} alt={photo.caption || ''} width={200} height={150} className="w-full h-28 object-cover" />
              {photo.caption && (
                <p className="text-xs text-gray-600 px-2 py-1 bg-white/90 truncate">{photo.caption}</p>
              )}
              <button
                onClick={() => handleDelete(photo.id)}
                className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
