import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  computeUptimePercent,
  countConsecutiveFailures,
  latencySeries,
  latestStatus,
  type HeartbeatRow,
} from '@/lib/heartbeat';

// 60s staleness is acceptable: heartbeats are written every 5 min by the
// cron, so a public status page reading 60-second-old data still reflects
// the last successful (or failed) ping. Dropping force-dynamic lets the
// page be served from the edge cache and keeps load away from the DB.
export const revalidate = 60;
export const runtime = 'nodejs';

// Cached heartbeat loader — 30s TTL is well below the 5-min cron tick so
// new pings still surface fast, but at 10x traffic this collapses all
// /status hits in the same window into a single DB query. The page is
// public and the underlying findMany scans up to 10k heartbeats (30 days
// of data) which is non-trivial under load. Tag `status` lets cron jobs
// or admin actions force a refresh via `revalidateTag('status')`.
const getHeartbeatSnapshot = unstable_cache(
  async (sinceMs: number): Promise<{ rows: HeartbeatRow[]; ok: boolean }> => {
    try {
      const rows = await prisma.heartbeat.findMany({
        where: { timestamp: { gte: new Date(sinceMs) } },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true, status: true, latencyMs: true, dbStatus: true, redisStatus: true },
        take: 10_000,
      });
      return { rows, ok: true };
    } catch {
      return { rows: [], ok: false };
    }
  },
  ['public-status-heartbeats'],
  { tags: ['status'], revalidate: 30 },
);

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: '#16a34a', text: '#fff', label: 'Tous les systèmes opérationnels' },
  degraded: { bg: '#f59e0b', text: '#fff', label: 'Service dégradé' },
  down: { bg: '#dc2626', text: '#fff', label: 'Incident en cours' },
};

function formatPct(p: number | null): string {
  if (p === null) return 'N/A';
  return `${p.toFixed(2)}%`;
}

function formatTime(d: Date): string {
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LatencyChart({ points }: { points: ReadonlyArray<{ t: Date; latencyMs: number; status: string }> }) {
  if (points.length === 0) {
    return <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Aucune donnée sur les 24 dernières heures.</p>;
  }
  const W = 720;
  const H = 160;
  const PAD = 28;
  const maxLat = Math.max(100, ...points.map((p) => p.latencyMs));
  const tMin = points[0].t.getTime();
  const tMax = points[points.length - 1].t.getTime();
  const tRange = Math.max(1, tMax - tMin);

  const x = (t: Date) => PAD + ((t.getTime() - tMin) / tRange) * (W - PAD * 2);
  const y = (lat: number) => H - PAD - (lat / maxLat) * (H - PAD * 2);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.latencyMs).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Latence DB sur 24h">
      <rect x={0} y={0} width={W} height={H} fill="#fafafa" />
      {[0, 0.5, 1].map((frac) => {
        const yy = H - PAD - frac * (H - PAD * 2);
        const lbl = Math.round(maxLat * frac);
        return (
          <g key={frac}>
            <line x1={PAD} y1={yy} x2={W - PAD} y2={yy} stroke="#e5e7eb" strokeWidth={1} />
            <text x={4} y={yy + 4} fontSize={10} fill="#6b7280">{lbl}ms</text>
          </g>
        );
      })}
      {maxLat > 500 && (
        <line
          x1={PAD}
          y1={y(500)}
          x2={W - PAD}
          y2={y(500)}
          stroke="#dc2626"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p.t)}
          cy={y(p.latencyMs)}
          r={2}
          fill={p.status === 'ok' ? '#16a34a' : p.status === 'degraded' ? '#f59e0b' : '#dc2626'}
        />
      ))}
    </svg>
  );
}

export default async function StatusPage() {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000);

  // unstable_cache requires JSON-serialisable args ; pass the cutoff as a
  // number rather than a Date and round to the nearest minute so transient
  // millisecond drift between requests in the same window still hits the
  // cache (rather than producing a fresh key per request).
  const sinceMs = Math.floor(since30d.getTime() / 60_000) * 60_000;
  const snapshot = await getHeartbeatSnapshot(sinceMs);
  const rows: HeartbeatRow[] = snapshot.rows;
  const dbReachable = snapshot.ok;

  const current = latestStatus(rows);
  const consecutiveKO = countConsecutiveFailures(rows);
  const colors = STATUS_COLORS[current];

  const uptime24h = computeUptimePercent(rows, since24h, now);
  const uptime7d = computeUptimePercent(rows, since7d, now);
  const uptime30d = computeUptimePercent(rows, since30d, now);

  const latencyPoints = latencySeries(rows, since24h, now);
  const incidents = rows.filter((r) => r.status !== 'ok').slice(0, 10);

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 880, margin: '0 auto', padding: '32px 16px', color: '#111' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Dog Universe — Statut</h1>
        <p style={{ color: '#6b7280', marginTop: 4 }}>Page publique de monitoring. Mise à jour toutes les 5 minutes.</p>
      </header>

      <section
        aria-label="Statut actuel"
        style={{
          background: colors.bg,
          color: colors.text,
          padding: '20px 24px',
          borderRadius: 8,
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600 }}>{colors.label}</div>
        <div style={{ fontSize: 14, marginTop: 4, opacity: 0.9 }}>
          {dbReachable
            ? `Dernière vérification : ${rows[0] ? formatTime(rows[0].timestamp) : 'aucune donnée'}`
            : 'Base de données injoignable depuis cette page'}
          {consecutiveKO > 0 && ` · ${consecutiveKO} échec${consecutiveKO > 1 ? 's' : ''} consécutif${consecutiveKO > 1 ? 's' : ''}`}
        </div>
      </section>

      <section aria-label="Uptime" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Uptime</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: '24 heures', value: uptime24h },
            { label: '7 jours', value: uptime7d },
            { label: '30 jours', value: uptime30d },
          ].map((card) => (
            <div key={card.label} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>{formatPct(card.value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Latence base de données 24h" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Latence base de données — 24 heures</h2>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#fff' }}>
          <LatencyChart points={latencyPoints} />
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Ligne pointillée rouge : budget 500 ms. Points colorés : vert ok, orange dégradé, rouge down.
          </p>
        </div>
      </section>

      <section aria-label="Derniers incidents">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>10 derniers incidents</h2>
        {incidents.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Aucun incident enregistré sur 30 jours.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '8px 4px' }}>Quand</th>
                <th style={{ padding: '8px 4px' }}>Statut</th>
                <th style={{ padding: '8px 4px' }}>DB</th>
                <th style={{ padding: '8px 4px' }}>Redis</th>
                <th style={{ padding: '8px 4px' }}>Latence</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 4px' }}>{formatTime(inc.timestamp)}</td>
                  <td style={{ padding: '8px 4px' }}>
                    <span
                      style={{
                        background: STATUS_COLORS[inc.status]?.bg ?? '#6b7280',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      {inc.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 4px' }}>{inc.dbStatus}</td>
                  <td style={{ padding: '8px 4px' }}>{inc.redisStatus}</td>
                  <td style={{ padding: '8px 4px' }}>{inc.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>
        Monitoring interne. Pour la détection des pannes Vercel elles-mêmes, un service externe (UptimeRobot / Better Stack) est recommandé en complément.
      </footer>
    </main>
  );
}
