import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer } from './supabase';

// Local filesystem fallback (dev without Supabase env vars)
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE ?? '10485760'); // 10 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// Detect MIME type from magic bytes (first bytes of file content)
function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // PDF: 25 50 44 46 (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  // WebP: RIFF????WEBP
  if (buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

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

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Validate actual file content via magic bytes (prevents MIME spoofing)
  const detectedMime = detectMimeFromBuffer(buffer);
  if (!detectedMime || !allowedTypes.includes(detectedMime)) {
    throw new Error('File content does not match its declared type.');
  }

  // Use the server-detected MIME type (authoritative)
  const ext = getExtension(detectedMime);
  const filename = `${uuidv4()}${ext}`;
  const subfolder =
    uploadType === 'stay-photo' ? 'stays'
    : uploadType === 'pet-photo' ? 'pets'
    : 'documents';

  if (hasSupabase) {
    // Production: Supabase Storage — persists across deployments
    const key = `${subfolder}/${filename}`;
    const url = await uploadBuffer(buffer, key, detectedMime);
    return { url, filename, mimeType: detectedMime, size: file.size };
  } else {
    // Local dev fallback: write to public/uploads/
    const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './public/uploads';
    const dir = path.join(process.cwd(), UPLOAD_DIR, subfolder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);
    const url = `/uploads/${subfolder}/${filename}`;
    return { url, filename, mimeType: detectedMime, size: file.size };
  }
}

export function getPublicUrl(filePath: string): string {
  if (filePath.startsWith('/') || filePath.startsWith('http')) return filePath;
  return `/${filePath}`;
}
