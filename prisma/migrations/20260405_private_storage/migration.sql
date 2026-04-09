-- Migration: Private storage bucket for sensitive documents
-- Run this on your Supabase project (SQL Editor or CLI)

-- 1. Make pdfUrl optional on ClientContract
--    (contracts now use storageKey + signed URLs — no permanent public URL stored)
ALTER TABLE "ClientContract" ALTER COLUMN "pdfUrl" DROP NOT NULL;

-- 2. Create the private storage bucket for contracts and documents
--    This bucket must NOT be marked as "Public" — files are served via signed URLs only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads-private',
  'uploads-private',
  false,
  10485760,  -- 10 MB max
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. Storage policies for uploads-private (idempotent via DO block)
--    The app uses SERVICE_ROLE_KEY which bypasses RLS.
--    These policies ensure anon / authenticated users cannot access files directly.

-- Deny all public SELECT access (belt-and-suspenders — bucket.public=false is the primary control)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'deny_public_select_private'
  ) THEN
    CREATE POLICY "deny_public_select_private"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'uploads-private' AND false);
  END IF;
END
$$;

-- Allow service role INSERT (bypasses RLS, but explicit policy for clarity)
-- Note: SERVICE_ROLE_KEY already bypasses RLS — no policy needed for it.
