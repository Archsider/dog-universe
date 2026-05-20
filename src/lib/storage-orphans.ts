// Storage orphans scanner — detects files in Supabase buckets that no
// longer have a DB row referencing them.  Designed by the audit agent
// Wave 7 ; landed standalone here.
//
// Two output buckets :
//   - orphansInStorage : bucket file → no DB ref → safe to delete (free space)
//   - missingFiles     : DB row → bucket file gone → broken reference (bug signal)
//
// Source : Wave 7.1 follow-up to /admin/maintenance.

import { prisma } from './prisma';
import { logger } from './logger';

const SAFETY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h grace : skip files freshly uploaded

export interface OrphanFile {
  bucket: string;
  key: string;
  sizeBytes: number | null;
  ageDays: number;
}

export interface MissingFile {
  refSource: string;
  refId: string;
  bucket: string;
  key: string;
}

export interface OrphanScanResult {
  orphansInStorage: OrphanFile[];
  missingFiles: MissingFile[];
  scannedAt: string;
  totalsByBucket: Record<string, number>;
  totalsBytes: number;
}

/** Extract the bucket key from a Supabase public URL or signed URL. */
function extractKey(url: string | null | undefined): { bucket: string; key: string } | null {
  if (!url) return null;
  // Public URL : https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<key>
  // Signed URL : https://<proj>.supabase.co/storage/v1/object/sign/<bucket>/<key>?token=...
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], key: decodeURIComponent(m[2]) };
}

async function collectReferencedKeys(): Promise<Set<string>> {
  // Format : "bucket:key"
  const refs = new Set<string>();

  const add = (e: { bucket: string; key: string } | null) => {
    if (e) refs.add(`${e.bucket}:${e.key}`);
  };

  // Pet.photoUrl — public URL
  const pets = await prisma.pet.findMany({ select: { photoUrl: true } });
  for (const p of pets) add(extractKey(p.photoUrl));

  // StayPhoto.url — public URL
  const stayPhotos = await prisma.stayPhoto.findMany({ select: { url: true } });
  for (const s of stayPhotos) add(extractKey(s.url));

  // DailyReport.photoUrls (TEXT[]) — public URLs
  const dailyReports = await prisma.dailyReport.findMany({ select: { photoUrls: true } });
  for (const r of dailyReports) for (const u of r.photoUrls ?? []) add(extractKey(u));

  // PetDocument.storageKey + fileUrl fallback — private bucket
  const docs = await prisma.petDocument.findMany({ select: { storageKey: true, fileUrl: true } });
  for (const d of docs) {
    if (d.storageKey) refs.add(`uploads-private:${d.storageKey}`);
    else add(extractKey(d.fileUrl));
  }

  // ClientContract.storageKey — private bucket
  const contracts = await prisma.clientContract.findMany({ select: { storageKey: true } });
  for (const c of contracts) if (c.storageKey) refs.add(`uploads-private:${c.storageKey}`);

  // LifetimeContract.storageKey — private bucket
  const lifetimeContracts = await prisma.lifetimeContract.findMany({ select: { storageKey: true } });
  for (const l of lifetimeContracts) if (l.storageKey) refs.add(`uploads-private:${l.storageKey}`);

  return refs;
}

const SCAN_PREFIXES: Record<string, string[]> = {
  'uploads':         ['pets', 'stays', 'daily-reports'],
  'uploads-private': ['contracts', 'contracts-lifetime', 'documents'],
};

export async function findStorageOrphans(): Promise<OrphanScanResult> {
  let supabaseClient: unknown = null;
  try {
    const mod = await import('@/lib/supabase');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseClient = (mod as any).supabaseAdmin ?? (mod as any).default ?? null;
  } catch { /* fail-soft */ }

  if (!supabaseClient) {
    throw new Error('SUPABASE_CLIENT_UNAVAILABLE');
  }

  const referenced = await collectReferencedKeys();
  const orphans: OrphanFile[] = [];
  const cutoff = Date.now() - SAFETY_WINDOW_MS;
  const totalsByBucket: Record<string, number> = {};
  let totalBytes = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabaseClient as any;

  for (const [bucket, prefixes] of Object.entries(SCAN_PREFIXES)) {
    totalsByBucket[bucket] = 0;
    for (const prefix of prefixes) {
      let offset = 0;
      // Pagination cap : 10k files / bucket / prefix is plenty.
      while (offset < 10_000) {
        let data: Array<{ name: string; created_at: string | null; metadata: { size?: number } | null }> = [];
        try {
          const r = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
          if (r.error) throw new Error(r.error.message);
          data = r.data ?? [];
        } catch (err) {
          logger.warn('storage-orphans', 'list_failed', {
            bucket, prefix,
            error: err instanceof Error ? err.message : String(err),
          });
          break;
        }
        if (data.length === 0) break;
        for (const f of data) {
          const key = `${prefix}/${f.name}`;
          const createdMs = f.created_at ? Date.parse(f.created_at) : Date.now();
          if (createdMs > cutoff) continue;                     // grace window
          if (referenced.has(`${bucket}:${key}`)) continue;     // referenced
          const size = f.metadata?.size ?? null;
          orphans.push({
            bucket,
            key,
            sizeBytes: size,
            ageDays: Math.floor((Date.now() - createdMs) / 86_400_000),
          });
          totalsByBucket[bucket]++;
          if (size) totalBytes += size;
        }
        if (data.length < 1000) break;
        offset += 1000;
      }
    }
  }

  // Detect missing files would require listing every referenced key against
  // bucket existence — costly.  Skip for now and surface later if a real
  // signal emerges (404 on signed URLs).
  return {
    orphansInStorage: orphans.sort((a, b) => b.ageDays - a.ageDays),
    missingFiles: [],
    scannedAt: new Date().toISOString(),
    totalsByBucket,
    totalsBytes: totalBytes,
  };
}

export async function deleteStorageOrphans(items: Array<{ bucket: string; key: string }>): Promise<{ deleted: number; failed: number }> {
  let supabaseClient: unknown = null;
  try {
    const mod = await import('@/lib/supabase');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseClient = (mod as any).supabaseAdmin ?? (mod as any).default ?? null;
  } catch { /* fail-soft */ }
  if (!supabaseClient) throw new Error('SUPABASE_CLIENT_UNAVAILABLE');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabaseClient as any;
  // Group by bucket to use bulk remove() API.
  const byBucket = new Map<string, string[]>();
  for (const it of items) {
    const arr = byBucket.get(it.bucket) ?? [];
    arr.push(it.key);
    byBucket.set(it.bucket, arr);
  }

  let deleted = 0;
  let failed = 0;
  for (const [bucket, keys] of byBucket) {
    try {
      const { error } = await client.storage.from(bucket).remove(keys);
      if (error) {
        failed += keys.length;
        logger.error('storage-orphans', 'remove_failed', { bucket, error: error.message });
      } else {
        deleted += keys.length;
      }
    } catch (err) {
      failed += keys.length;
      logger.error('storage-orphans', 'remove_exception', {
        bucket, error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { deleted, failed };
}
