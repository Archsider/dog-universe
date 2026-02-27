import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './public/uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE ?? '10485760'); // 10 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export type UploadType = 'pet-photo' | 'document';

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
    uploadType === 'pet-photo' ? ALLOWED_IMAGE_TYPES : ALLOWED_DOCUMENT_TYPES;

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`File type not allowed: ${file.type}`);
  }

  const ext = getExtension(file.type);
  const filename = `${uuidv4()}${ext}`;
  const subfolder = uploadType === 'pet-photo' ? 'pets' : 'documents';
  const dir = path.join(process.cwd(), UPLOAD_DIR, subfolder);

  await mkdir(dir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filePath = path.join(dir, filename);

  await writeFile(filePath, buffer);

  const url = `/uploads/${subfolder}/${filename}`;

  return {
    url,
    filename,
    mimeType: file.type,
    size: file.size,
  };
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
  if (filePath.startsWith('/')) return filePath;
  return `/${filePath}`;
}
