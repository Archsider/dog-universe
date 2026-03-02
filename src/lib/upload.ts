import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from './supabase';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE ?? '10485760'); // 10 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export type UploadType = 'pet-photo' | 'document' | 'stay-photo';

export interface UploadResult {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export async function uploadFile(
  file: File,
  uploadType: UploadType
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large. Maximum size is 10 MB.');
  }

  const allowedTypes =
    uploadType === 'document' ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES;

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`File type not allowed: ${file.type}`);
  }

  const ext = getExtension(file.type);
  const filename = `${uuidv4()}${ext}`;
  const subfolder =
    uploadType === 'stay-photo' ? 'stays' : uploadType === 'pet-photo' ? 'pets' : 'documents';
  const storagePath = `${subfolder}/${filename}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    url: data.publicUrl,
    filename,
    mimeType: file.type,
    size: file.size,
  };
}

export async function deleteFile(url: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  // Extract the storage path from the public URL
  // Public URL format: {supabaseUrl}/storage/v1/object/public/{bucket}/{path}
  const prefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (!url.startsWith(prefix)) return;
  const storagePath = url.slice(prefix.length);
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  };
  return map[mimeType] ?? '.bin';
}

export function getPublicUrl(filePath: string): string {
  if (filePath.startsWith('http')) return filePath;
  if (filePath.startsWith('/')) return filePath;
  return `/${filePath}`;
}
