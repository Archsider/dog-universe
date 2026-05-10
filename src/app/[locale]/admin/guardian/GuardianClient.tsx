'use client';

import { useMemo, useState } from 'react';

interface GuardianEventView {
  id: string;
  sentryEventId: string;
  sentryIssueId: string | null;
  title: string;
  culprit: string | null;
  level: string | null;
  classification: string;
  severity: number;
  action: string;
  reason: string | null;
  githubIssueUrl: string | null;
  occurrencesSeen: number;
  createdAt: string;
}

const SEVERITY_COLOR: Record<number, string> = {
  1: 'bg-gray-100 text-gray-700 border-gray-300',
  2: 'bg-blue-100 text-blue-700 border-blue-300',
  3: 'bg-amber-100 text-amber-700 border-amber-300',
  4: 'bg-orange-100 text-orange-700 border-orange-300',
  5: 'bg-red-100 text-red-700 border-red-300',
};

const CLASSIFICATION_COLOR: Record<string, string> = {
  transient: 'bg-gray-100 text-gray-700',
  bug_code: 'bg-red-100 text-red-700',
  data_corruption: 'bg-purple-100 text-purple-700',
  infra: 'bg-orange-100 text-orange-700',
  spam: 'bg-zinc-100 text-zinc-600',
  unclassified: 'bg-yellow-100 text-yellow-800',
};

const ACTION_LABEL: Record<string, { fr: string; en: string }> = {
  github_issue: { fr: 'Issue GitHub', en: 'GitHub issue' },
  notify_admin: { fr: 'Admin notifié', en: 'Admin notified' },
  silence: { fr: 'Silencé', en: 'Silenced' },
  unclassified: { fr: 'Non classifié', en: 'Unclassified' },
};

export default function GuardianClient({
  isFr,
  events,
}: {
  isFr: boolean;
  events: GuardianEventView[];
}) {
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.classification === filter)),
    [events, filter],
  );

  const classifications = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.classification));
    return Array.from(set);
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-charcoal">
            {isFr ? 'Agent IA Gardien' : 'AI Guardian'}
          </h1>
          <p className="text-sm text-charcoal/60 mt-1">
            {isFr
              ? '30 derniers évènements Sentry classifiés par Claude Haiku.'
              : '30 most recent Sentry events triaged by Claude Haiku.'}
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 text-sm border rounded-md bg-white border-ivory-300"
        >
          <option value="all">{isFr ? 'Toutes catégories' : 'All categories'}</option>
          {classifications.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ivory-300 bg-white p-10 text-center text-charcoal/60">
          {isFr ? 'Aucun évènement à afficher.' : 'No events to display.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ivory-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ivory-50 text-charcoal/70 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">{isFr ? 'Quand' : 'When'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Titre' : 'Title'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Catégorie' : 'Class'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Sévérité' : 'Severity'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Action' : 'Action'}</th>
                <th className="px-3 py-2 text-left">24h</th>
                <th className="px-3 py-2 text-left">Issue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const actionLbl = ACTION_LABEL[e.action] ?? { fr: e.action, en: e.action };
                return (
                  <tr key={e.id} className="border-t border-ivory-100 align-top">
                    <td className="px-3 py-2 text-xs text-charcoal/70 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString(isFr ? 'fr-FR' : 'en-GB')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-charcoal max-w-md break-words">{e.title}</div>
                      {e.culprit && (
                        <div className="text-[11px] text-charcoal/50 mt-0.5 font-mono break-all">
                          {e.culprit}
                        </div>
                      )}
                      {e.reason && (
                        <div className="text-[12px] text-charcoal/70 mt-1 italic">{e.reason}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          CLASSIFICATION_COLOR[e.classification] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {e.classification}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${
                          SEVERITY_COLOR[e.severity] ?? 'bg-gray-100 text-gray-700 border-gray-300'
                        }`}
                      >
                        {e.severity}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/80">
                      {isFr ? actionLbl.fr : actionLbl.en}
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/70">{e.occurrencesSeen}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.githubIssueUrl ? (
                        <a
                          href={e.githubIssueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gold-700 hover:text-gold-800 underline"
                        >
                          GitHub
                        </a>
                      ) : (
                        <span className="text-charcoal/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
