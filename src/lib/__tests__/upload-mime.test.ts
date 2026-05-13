// Magic-bytes MIME detection — security-critical because the front-end
// `file.type` is attacker-controlled. Without these signatures, an attacker
// could rename `evil.exe` to `pet.jpg` and bypass the allow-list.
//
// We test the public surface (`uploadFile`) by feeding it forged Files —
// the actual storage call is mocked away.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all storage I/O so the test doesn't need Supabase or the local FS.
vi.mock('../supabase', () => ({
  uploadBuffer: vi.fn(async () => 'https://supabase.local/uploads/file.png'),
  uploadBufferPrivate: vi.fn(async () => 'private-key'),
  createSignedUrl: vi.fn(async () => 'https://supabase.local/signed/file.pdf'),
}));
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));
vi.mock('sharp', () => ({
  default: () => ({
    rotate: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff]) }) }),
    png: () => ({ toBuffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
    webp: () => ({ toBuffer: async () => Buffer.from([0x52, 0x49, 0x46, 0x46]) }),
  }),
}));

// Force the local-filesystem branch so we don't need the Supabase env block.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { uploadFile } from '../upload';

function makeFile(bytes: number[], filename: string, declaredMime: string): File {
  return new File([new Uint8Array(bytes)], filename, { type: declaredMime });
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const EXE_MAGIC = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]; // Windows PE header
const TXT_BYTES = [0x68, 0x65, 0x6c, 0x6c, 0x6f]; // "hello"

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadFile — declared MIME allow-list', () => {
  it('rejects when declared MIME is not in the allow-list (image upload)', async () => {
    const file = makeFile(JPEG_MAGIC, 'photo.svg', 'image/svg+xml');
    await expect(uploadFile(file, 'pet-photo')).rejects.toThrow(/not allowed/);
  });

  it('rejects PDFs from the pet-photo upload path', async () => {
    const file = makeFile(PDF_MAGIC, 'doc.pdf', 'application/pdf');
    await expect(uploadFile(file, 'pet-photo')).rejects.toThrow(/not allowed/);
  });

  it('accepts PDFs only on the document upload path', async () => {
    const file = makeFile(PDF_MAGIC, 'invoice.pdf', 'application/pdf');
    const res = await uploadFile(file, 'document');
    expect(res.mimeType).toBe('application/pdf');
  });

  it('accepts JPEG / PNG / WebP / GIF on pet-photo path', async () => {
    for (const [bytes, declared] of [
      [JPEG_MAGIC, 'image/jpeg'],
      [PNG_MAGIC, 'image/png'],
      [WEBP_MAGIC, 'image/webp'],
      [GIF_MAGIC, 'image/gif'],
    ] as const) {
      const file = makeFile(bytes, `f.${declared.split('/')[1]}`, declared);
      const res = await uploadFile(file, 'pet-photo');
      expect(res.mimeType).toBeTruthy();
    }
  });
});

describe('uploadFile — magic-bytes spoofing detection', () => {
  it('rejects an .exe renamed as .jpg with declared image/jpeg', async () => {
    const file = makeFile(EXE_MAGIC, 'pwned.jpg', 'image/jpeg');
    await expect(uploadFile(file, 'pet-photo')).rejects.toThrow(/does not match|mime mismatch|invalid|not allowed/i);
  });

  it('rejects plain text masquerading as PNG', async () => {
    const file = makeFile(TXT_BYTES, 'meta.png', 'image/png');
    await expect(uploadFile(file, 'pet-photo')).rejects.toThrow();
  });

  it('rejects an HTML script renamed as PDF', async () => {
    const html = Array.from(Buffer.from('<script>alert(1)</script>'));
    const file = makeFile(html, 'evil.pdf', 'application/pdf');
    await expect(uploadFile(file, 'document')).rejects.toThrow();
  });
});

describe('uploadFile — size guard', () => {
  it('rejects files larger than MAX_FILE_SIZE', async () => {
    // Fake an 11 MB file by patching the size property — we don't need to
    // actually allocate 11 MB.
    const file = makeFile(JPEG_MAGIC, 'big.jpg', 'image/jpeg');
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 });
    await expect(uploadFile(file, 'pet-photo')).rejects.toThrow(/too large/i);
  });
});
