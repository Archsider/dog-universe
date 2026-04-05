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

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';

/**
 * Upload a buffer to Supabase Storage and return the public URL.
 * @param buffer   File content
 * @param key      Storage path, e.g. "contracts/abc123.pdf"
 * @param mimeType MIME type of the file
 */
export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(bucket)
    .upload(key, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(key);
  if (!data?.publicUrl) {
    throw new Error(`Supabase getPublicUrl returned empty URL for key: ${key}`);
  }
  return data.publicUrl;
}

/**
 * Delete a file from Supabase Storage.
 * @param key Storage path, e.g. "contracts/abc123.pdf"
 */
export async function deleteFromStorage(key: string): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(bucket).remove([key]);
  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }
}

/**
 * Generate a short-lived signed URL for private file access.
 * Use this for sensitive documents (contracts, client documents) instead of
 * the permanent public URL. Requires the bucket to be set to PRIVATE in
 * the Supabase dashboard for full security.
 * @param key          Storage path, e.g. "contracts/abc123.pdf"
 * @param expiresIn    Expiry in seconds (default: 3600 = 1 hour)
 */
export async function createSignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Supabase signed URL failed: ${error?.message ?? 'no URL returned'}`);
  }
  return data.signedUrl;
}
