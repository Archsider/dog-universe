import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let _client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars not configured');
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

/** Public bucket — for photos (pets/, stays/). Files served via getPublicUrl(). */
const bucket = env.SUPABASE_STORAGE_BUCKET;

/**
 * Private bucket — for sensitive files (contracts/, documents/).
 * Must be set to PRIVATE in Supabase Dashboard (or via SQL migration).
 * Files are served via createSignedUrl() only — never via getPublicUrl().
 */
const privateBucket = env.SUPABASE_PRIVATE_STORAGE_BUCKET;

// ─── Public bucket (photos) ────────────────────────────────────────────────

/**
 * Upload a buffer to the PUBLIC Supabase Storage bucket and return its public URL.
 * Use only for non-sensitive files: pet photos, stay photos.
 */
export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(bucket)
    .upload(key, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(key);
  if (!data?.publicUrl) {
    throw new Error(`Supabase getPublicUrl returned empty URL for key: ${key}`);
  }
  return data.publicUrl;
}

// ─── Private bucket (contracts / documents) ────────────────────────────────

/**
 * Upload a buffer to the PRIVATE Supabase Storage bucket.
 * Returns the storage key (not a URL). Call createSignedUrl() to serve.
 * Use for contracts, client documents, and any file containing PII.
 */
export async function uploadBufferPrivate(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(privateBucket)
    .upload(key, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`Supabase private upload failed: ${error.message}`);
  }

  return key; // Return the key — caller must use createSignedUrl() to serve the file
}

/**
 * Delete a file from the private Supabase Storage bucket.
 */
export async function deleteFromPrivateStorage(key: string): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(privateBucket).remove([key]);
  if (error) {
    throw new Error(`Supabase private delete failed: ${error.message}`);
  }
}

/**
 * Generate a short-lived signed URL for a file in the PRIVATE bucket.
 * @param key          Storage path, e.g. "contracts/abc123.pdf"
 * @param expiresIn    Expiry in seconds (default: 900 = 15 min)
 *                     15 min — standard sécurité documents privés (ISO 27001).
 */
export async function createSignedUrl(
  key: string,
  expiresIn = 900
): Promise<string> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(privateBucket)
    .createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Supabase signed URL failed: ${error?.message ?? 'no URL returned'}`);
  }
  return data.signedUrl;
}

// ─── Backups bucket (internal-only — no magic-bytes validation) ────────────
//
// The backup bucket is reserved for trusted internal sources (DB dump cron +
// SUPERADMIN-triggered "Backup now"). It deliberately bypasses the
// magic-bytes whitelist used for user uploads (JPEG/PNG/WebP/GIF/PDF only —
// see src/lib/upload.ts) because gzipped JSON dumps are not a recognised
// image/document MIME and the whitelist would reject them.
//
// SECURITY INVARIANTS:
//   1. The bucket name comes from `env.SUPABASE_BACKUPS_BUCKET` (default
//      'db-backups') and must be PRIVATE on Supabase — no public URLs are
//      ever generated, only signed URLs (createSignedBackupUrl).
//   2. These functions are exported but the codebase enforces that they're
//      only called from `src/lib/db-backup.ts` and the three admin backup
//      routes (trigger / restore / download). No user input is ever fed
//      to them; the `key` argument is always built from a server-controlled
//      ISO date string.
//
// IMPORTANT — the bucket itself must be provisioned in Supabase with NO
// MIME allowlist (or with `application/octet-stream` explicitly listed).
// Otherwise uploads from this module will fail with the "mime type X is
// not supported" Supabase Storage error regardless of what we set
// `contentType` to. See the SQL action documented in CLAUDE.md.

const backupsBucket = env.SUPABASE_BACKUPS_BUCKET;

/**
 * Upload a buffer to the PRIVATE backups bucket. Internal-trust ONLY —
 * never call from a code path that handles user input. Default
 * `application/octet-stream` content type fits any binary blob; the
 * file extension on `key` (e.g. `.json.gz`) keeps the format obvious
 * for downstream consumers.
 */
export async function uploadBackupBuffer(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream',
): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(backupsBucket)
    .upload(key, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`Backup upload failed: ${error.message}`);
  }
}

/**
 * Download a backup as a raw blob. Used by the restore + download admin
 * routes. Throws on any Supabase error.
 */
export async function downloadBackupBlob(key: string): Promise<Blob> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage.from(backupsBucket).download(key);
  if (error || !data) {
    throw new Error(`Backup download failed: ${error?.message ?? 'no body'}`);
  }
  return data;
}

interface BackupFileMeta {
  name: string;
  created_at: string | null;
  metadata: { size: number | null } | null;
}

/**
 * List objects inside `path` of the backups bucket. Used by the listing
 * + rotation logic in `db-backup.ts`.
 */
export async function listBackupObjects(
  path: string,
  options?: { limit?: number; sortBy?: { column: string; order: 'asc' | 'desc' } },
): Promise<BackupFileMeta[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage.from(backupsBucket).list(path, {
    limit: options?.limit ?? 1000,
    sortBy: options?.sortBy,
  });
  if (error) throw new Error(`Backup list failed: ${error.message}`);
  return (data ?? []).map((f) => ({
    name: f.name,
    created_at: f.created_at ?? null,
    metadata: f.metadata ? { size: (f.metadata as { size?: number }).size ?? null } : null,
  }));
}

/** Remove a list of backup keys. Tolerates partial failure (rotation
 *  is non-fatal: a failed delete must never invalidate a successful
 *  upload that ran just before). */
export async function removeBackupObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(backupsBucket).remove(keys);
  if (error) throw new Error(`Backup remove failed: ${error.message}`);
}

/** Signed URL for downloading a backup. Same 15-min expiry as the
 *  private documents bucket. */
export async function createSignedBackupUrl(key: string, expiresIn = 900): Promise<string> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(backupsBucket)
    .createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Backup signed URL failed: ${error?.message ?? 'no URL returned'}`);
  }
  return data.signedUrl;
}

// ─── Health check ──────────────────────────────────────────────────────────

/** List buckets as a lightweight liveness probe. Returns false if unconfigured or on error. */
export async function checkStorageHealth(): Promise<boolean> {
  try {
    const client = getSupabaseAdmin();
    const { error } = await client.storage.listBuckets();
    return !error;
  } catch {
    return false;
  }
}
