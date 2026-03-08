import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer } from './supabase';

// Local filesystem fallback (dev without Supabase env vars)
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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

const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

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
    uploadType === 'stay-photo' ? 'stays'
    : uploadType === 'pet-photo' ? 'pets'
    : 'documents';

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (hasSupabase) {
    // Production: Supabase Storage — persists across deployments
    const key = `${subfolder}/${filename}`;
    const url = await uploadBuffer(buffer, key, file.type);
    return { url, filename, mimeType: file.type, size: file.size };
  } else {
    // Local dev fallback: write to public/uploads/
    const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './public/uploads';
    const dir = path.join(process.cwd(), UPLOAD_DIR, subfolder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);
    const url = `/uploads/${subfolder}/${filename}`;
    return { url, filename, mimeType: file.type, size: file.size };
  }
}

export function getPublicUrl(filePath: string): string {
  if (filePath.startsWith('/') || filePath.startsWith('http')) return filePath;
  return `/${filePath}`;
}
