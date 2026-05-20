'use client';

// Carte "Migrations DB" pour /admin/health. Source : audit Hashimoto Q3.
// Fetch GET /api/admin/migrations/status et affiche le diff entre fs et DB.
// Si pending > 0 → carte rouge avec bouton "Copier le SQL" par row pour
// faciliter l'exécution manuelle dans Supabase SQL Editor.

import { useEffect, useState } from 'react';
import { Database, ChevronDown, ChevronRight, Copy, CheckCheck, Loader2, Check } from 'lucide-react';

interface MigrationEntry {
  name: string;
  status: 'ok' | 'pending' | 'manual' | 'drift';
  localChecksum?: string;
  dbChecksum?: string | null;
  sql?: string;
}

interface MigrationsDiff {
  entries: MigrationEntry[];
  counts: { ok: number; pending: number; manual: number; drift: number };
  pendingCount: number;
}

interface Props {
  isFr: boolean;
}

const STATUS_STYLE: Record<MigrationEntry['status'], { label: { fr: string; en: string }; cls: string }> = {
  pending: { label: { fr: 'En attente',       en: 'Pending'  }, cls: 'bg-red-100 text-red-800 border-red-200' },
  drift:   { label: { fr: 'Checksum diverge', en: 'Drift'    }, cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  manual:  { label: { fr: 'Hors-repo',        en: 'Manual'   }, cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  ok:      { label: { fr: 'OK',               en: 'OK'       }, cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export function MigrationsHealthCard({ isFr }: Props) {
  const [data, setData] = useState<MigrationsDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [markingName, setMarkingName] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/migrations/status');
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const j: MigrationsDiff = await res.json();
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'fetch_failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copySql(entry: MigrationEntry) {
    if (!entry.sql) return;
    try {
      await navigator.clipboard.writeText(entry.sql);
      setCopiedName(entry.name);
      setTimeout(() => setCopiedName(null), 2000);
    } catch {
      // clipboard API failed — surface visually but no fallback.
    }
  }

  async function markApplied(entry: MigrationEntry) {
    // "I ran the SQL on Supabase manually, record it as applied" — inserts
    // a row into _app_migrations and removes the migration from the
    // pending list locally so the operator sees instant feedback.
    setMarkingName(entry.name);
    try {
      const r = await fetch(`/api/admin/migrations/${encodeURIComponent(entry.name)}/mark-applied`, {
        method: 'POST',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        try { window.dispatchEvent(new CustomEvent('toast', { detail: { kind: 'error', message: `Erreur : ${j.error ?? r.statusText}` } })); } catch {}
        return;
      }
      // Patch local state — flip status to 'ok' so the card shrinks.
      setData((prev) => {
        if (!prev) return prev;
        const newEntries = prev.entries.map((e) =>
          e.name === entry.name
            ? { ...e, status: 'ok' as const, dbChecksum: e.localChecksum ?? null, sql: undefined }
            : e,
        );
        const counts = { ok: 0, pending: 0, manual: 0, drift: 0 };
        for (const ent of newEntries) counts[ent.status]++;
        return { entries: newEntries, counts, pendingCount: counts.pending };
      });
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { kind: 'error', message: `Erreur : ${e instanceof Error ? e.message : String(e)}` } })); } catch {}
    } finally {
      setMarkingName(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-ivory-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {isFr ? 'Diff migrations en cours…' : 'Computing migrations diff…'}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">
        {isFr ? 'Erreur de diff migrations :' : 'Migrations diff error:'} <strong>{error ?? 'no data'}</strong>
      </div>
    );
  }

  const hasAttention = data.counts.pending > 0 || data.counts.drift > 0;
  const accentCls = hasAttention
    ? 'border-red-200 bg-red-50'
    : 'border-emerald-200 bg-emerald-50';

  // Sample entries to show without expansion : everything non-ok.
  const summarised = data.entries.filter((e) => e.status !== 'ok');
  const visible = expanded ? data.entries : summarised;

  return (
    <div className={`rounded-xl border ${accentCls} p-4`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-white border border-current/20 flex items-center justify-center flex-shrink-0">
          <Database className={`h-5 w-5 ${hasAttention ? 'text-red-600' : 'text-emerald-600'}`} />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-charcoal text-base">
            {isFr ? 'Migrations DB' : 'DB migrations'}
          </h2>
          <p className={`text-sm mt-0.5 ${hasAttention ? 'text-red-800' : 'text-emerald-800'}`}>
            {data.counts.pending > 0 && (
              <strong>
                {data.counts.pending}{' '}
                {isFr
                  ? `migration${data.counts.pending > 1 ? 's' : ''} à exécuter sur Supabase`
                  : `migration${data.counts.pending > 1 ? 's' : ''} pending on Supabase`}
              </strong>
            )}
            {data.counts.pending > 0 && (data.counts.drift > 0 || data.counts.manual > 0) && ' · '}
            {data.counts.drift > 0 && (
              <>
                {data.counts.drift} {isFr ? 'checksum diverge(nt)' : 'checksum drift(s)'}
              </>
            )}
            {data.counts.drift > 0 && data.counts.manual > 0 && ' · '}
            {data.counts.manual > 0 && (
              <span className="text-gray-600">
                {data.counts.manual} {isFr ? 'hors-repo' : 'out-of-repo'}
              </span>
            )}
            {!hasAttention && (
              <>{isFr ? 'Tout est à jour' : 'All up to date'} · {data.counts.ok} OK</>
            )}
          </p>
        </div>
      </div>

      {visible.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visible.map((e) => {
            const styling = STATUS_STYLE[e.status];
            return (
              <li key={e.name} className="bg-white rounded-lg border border-ivory-200 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-xs text-charcoal truncate">{e.name}</code>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${styling.cls}`}>
                      {isFr ? styling.label.fr : styling.label.en}
                    </span>
                  </div>
                  {e.status === 'pending' && e.sql && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copySql(e)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200"
                      >
                        {copiedName === e.name ? (
                          <>
                            <CheckCheck className="h-3 w-3" />
                            {isFr ? 'Copié !' : 'Copied!'}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            {isFr ? 'Copier SQL' : 'Copy SQL'}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void markApplied(e)}
                        disabled={markingName === e.name}
                        title={isFr
                          ? 'Si vous avez déjà exécuté ce SQL sur Supabase, enregistrez-le ici pour faire taire l\'alerte.'
                          : 'If you already ran this SQL on Supabase, record it here to silence the alert.'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50"
                      >
                        {markingName === e.name ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {isFr ? 'Déjà appliquée' : 'Already applied'}
                      </button>
                    </div>
                  )}
                </div>
                {e.status === 'drift' && (
                  <p className="text-[11px] text-orange-700 mt-1.5 font-mono">
                    local <code>{e.localChecksum?.slice(0, 8)}</code> ≠ db <code>{e.dbChecksum?.slice(0, 8) ?? '∅'}</code>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.counts.ok > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-charcoal"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded
            ? (isFr ? 'Masquer les OK' : 'Hide OK')
            : (isFr ? `Voir les ${data.counts.ok} migrations OK` : `Show ${data.counts.ok} OK migrations`)}
        </button>
      )}
    </div>
  );
}
