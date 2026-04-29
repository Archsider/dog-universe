import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { uploadBuffer, uploadBufferPrivate, createSignedUrl } from './supabase';

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
  storageKey?: string; // Private bucket key — present for 'document' uploads on Supabase
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

// Re-encode images through Sharp to strip EXIF metadata (GPS, device info, etc.).
// GIF is passed through unchanged — animated GIF re-encoding is not supported.
async function stripExif(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType === 'image/jpeg') return sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer();
  if (mimeType === 'image/png')  return sharp(buffer).png().toBuffer();
  if (mimeType === 'image/webp') return sharp(buffer).webp({ quality: 85 }).toBuffer();
  return buffer;
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

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Validate actual file content via magic bytes (prevents MIME spoofing)
  const detectedMime = detectMimeFromBuffer(buffer);
  if (!detectedMime || !allowedTypes.includes(detectedMime)) {
    throw new Error('File content does not match its declared type.');
  }

  // Strip EXIF metadata from images before storage (GPS, device info, etc.)
  // Documents (PDF) and GIFs are passed through unchanged.
  const processedBuffer = uploadType !== 'document'
    ? await stripExif(buffer, detectedMime)
    : buffer;

  // Use the server-detected MIME type (authoritative)
  const ext = getExtension(detectedMime);
  const filename = `${uuidv4()}${ext}`;
  const subfolder =
    uploadType === 'stay-photo' ? 'stays'
    : uploadType === 'pet-photo' ? 'pets'
    : 'documents';

  if (hasSupabase) {
    const key = `${subfolder}/${filename}`;
    if (uploadType === 'document') {
      // Documents go to the private bucket — return a 1-hour signed URL + permanent key
      await uploadBufferPrivate(processedBuffer, key, detectedMime);
      const url = await createSignedUrl(key);
      return { url, storageKey: key, filename, mimeType: detectedMime, size: processedBuffer.length };
    }
    // Pet photos and stay photos go to the public bucket
    const url = await uploadBuffer(processedBuffer, key, detectedMime);
    return { url, filename, mimeType: detectedMime, size: processedBuffer.length };
  } else {
    // Local dev fallback: write to public/uploads/
    const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './public/uploads';
    const dir = path.join(process.cwd(), UPLOAD_DIR, subfolder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), processedBuffer);
    const url = `/uploads/${subfolder}/${filename}`;
    return { url, filename, mimeType: detectedMime, size: processedBuffer.length };
  }
}

export function getPublicUrl(filePath: string): string {
  if (filePath.startsWith('/') || filePath.startsWith('http')) return filePath;
  return `/${filePath}`;
}
