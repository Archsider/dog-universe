import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars not configured');
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

/** Public bucket — for photos (pets/, stays/). Files served via getPublicUrl(). */
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';

/**
 * Private bucket — for sensitive files (contracts/, documents/).
 * Must be set to PRIVATE in Supabase Dashboard (or via SQL migration).
 * Files are served via createSignedUrl() only — never via getPublicUrl().
 */
const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET ?? 'uploads-private';

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
