'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export interface FlagRow {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  targetRoles: string[];
  userWhitelist: string[];
  updatedAt: string;
}

interface Props {
  locale: string;
  initialFlags: FlagRow[];
}

const ROLES = ['CLIENT', 'ADMIN', 'SUPERADMIN'] as const;

interface EditState {
  mode: 'create' | 'edit';
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  targetRoles: string[];
  userWhitelist: string;
}

function emptyEdit(): EditState {
  return {
    mode: 'create',
    key: '',
    description: '',
    enabled: false,
    rolloutPercent: 0,
    targetRoles: [],
    userWhitelist: '',
  };
}

export default function FeatureFlagsClient({ locale, initialFlags }: Props) {
  const isFr = locale === 'fr';
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const res = await fetch('/api/admin/feature-flags', { credentials: 'same-origin' });
    if (res.ok) {
      const data = (await res.json()) as Array<FlagRow & { updatedAt: string }>;
      setFlags(data.map((f) => ({ ...f, updatedAt: new Date(f.updatedAt).toISOString() })));
    }
  }

  async function toggleEnabled(row: FlagRow) {
    setBusy(row.key);
    try {
      const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(row.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      toast({ title: isFr ? 'Mis à jour' : 'Updated' });
      await reload();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function deleteFlag(row: FlagRow) {
    if (!confirm(isFr ? `Supprimer le flag "${row.key}" ?` : `Delete flag "${row.key}"?`)) return;
    setBusy(row.key);
    try {
      const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(row.key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('DELETE failed');
      toast({ title: isFr ? 'Supprimé' : 'Deleted' });
      await reload();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  function openCreate() {
    setEditing(emptyEdit());
  }

  function openEdit(row: FlagRow) {
    setEditing({
      mode: 'edit',
      key: row.key,
      description: row.description,
      enabled: row.enabled,
      rolloutPercent: row.rolloutPercent,
      targetRoles: [...row.targetRoles],
      userWhitelist: row.userWhitelist.join('\n'),
    });
  }

  async function save() {
    if (!editing) return;
    const userWhitelist = editing.userWhitelist
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setBusy(editing.key || '__new');
    try {
      const url = editing.mode === 'create'
        ? '/api/admin/feature-flags'
        : `/api/admin/feature-flags/${encodeURIComponent(editing.key)}`;
      const method = editing.mode === 'create' ? 'POST' : 'PATCH';
      const body = editing.mode === 'create'
        ? {
            key: editing.key,
            description: editing.description,
            enabled: editing.enabled,
            rolloutPercent: editing.rolloutPercent,
            targetRoles: editing.targetRoles,
            userWhitelist,
          }
        : {
            description: editing.description,
            enabled: editing.enabled,
            rolloutPercent: editing.rolloutPercent,
            targetRoles: editing.targetRoles,
            userWhitelist,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'save failed');
      }
      toast({ title: isFr ? 'Enregistré' : 'Saved' });
      setEditing(null);
      await reload();
    } catch (e) {
      toast({ title: isFr ? 'Erreur' : 'Error', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Flag className="h-6 w-6 text-charcoal" />
          <div>
            <h1 className="text-xl font-semibold text-charcoal">
              {isFr ? 'Feature flags' : 'Feature flags'}
            </h1>
            <p className="text-sm text-gray-500">
              {isFr ? 'Activation par rôle, % rollout, ou whitelist userId.' : 'Toggle by role, % rollout, or userId whitelist.'}
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-charcoal text-white hover:bg-charcoal/90">
          <Plus className="h-4 w-4 mr-2" />
          {isFr ? 'Nouveau flag' : 'New flag'}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Key</th>
              <th className="px-4 py-3 text-left">{isFr ? 'État' : 'Status'}</th>
              <th className="px-4 py-3 text-left">Rollout</th>
              <th className="px-4 py-3 text-left">{isFr ? 'Rôles' : 'Roles'}</th>
              <th className="px-4 py-3 text-left">Whitelist</th>
              <th className="px-4 py-3 text-left">{isFr ? 'Modifié' : 'Updated'}</th>
              <th className="px-4 py-3 text-right">{isFr ? 'Actions' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {isFr ? 'Aucun flag.' : 'No flag.'}
                </td>
              </tr>
            )}
            {flags.map((f) => (
              <tr key={f.key} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-mono text-charcoal">{f.key}</div>
                  {f.description && <div className="text-xs text-gray-500 mt-0.5">{f.description}</div>}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleEnabled(f)}
                    disabled={busy === f.key}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      f.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {busy === f.key ? <Loader2 className="h-3 w-3 animate-spin" /> : f.enabled ? (isFr ? 'Activé' : 'Enabled') : (isFr ? 'Désactivé' : 'Disabled')}
                  </button>
                </td>
                <td className="px-4 py-3 text-charcoal">{f.rolloutPercent}%</td>
                <td className="px-4 py-3 text-xs text-gray-600">{f.targetRoles.length === 0 ? '—' : f.targetRoles.join(', ')}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{f.userWhitelist.length}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(f.updatedAt).toLocaleString(isFr ? 'fr-MA' : 'en-GB')}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(f)} className="h-8">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteFlag(f)} disabled={busy === f.key} className="h-8 border-red-200 text-red-700 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-charcoal">
              {editing.mode === 'create' ? (isFr ? 'Nouveau feature flag' : 'New feature flag') : (isFr ? `Modifier "${editing.key}"` : `Edit "${editing.key}"`)}
            </h2>

            {editing.mode === 'create' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Key</label>
                <input
                  type="text"
                  value={editing.key}
                  onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                  placeholder="my-new-feature"
                  pattern="^[a-z0-9][a-z0-9_-]{0,63}$"
                />
                <p className="text-xs text-gray-500 mt-1">{isFr ? 'Lowercase, chiffres, tirets ou underscores.' : 'Lowercase, digits, dashes or underscores.'}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Description' : 'Description'}</label>
              <input
                type="text"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-sm"
                maxLength={500}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="enabled"
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              <label htmlFor="enabled" className="text-sm text-charcoal">
                {isFr ? 'Activé (kill-switch global)' : 'Enabled (global kill-switch)'}
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Rollout %: <span className="font-mono">{editing.rolloutPercent}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editing.rolloutPercent}
                onChange={(e) => setEditing({ ...editing, rolloutPercent: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Rôles ciblés (vide = tous)' : 'Target roles (empty = all)'}</label>
              <div className="flex gap-3">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.targetRoles.includes(r)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...editing.targetRoles, r]
                          : editing.targetRoles.filter((x) => x !== r);
                        setEditing({ ...editing, targetRoles: next });
                      }}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? 'Whitelist userId (un par ligne, bypass rollout)' : 'UserId whitelist (one per line, bypasses rollout)'}
              </label>
              <textarea
                value={editing.userWhitelist}
                onChange={(e) => setEditing({ ...editing, userWhitelist: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>{isFr ? 'Annuler' : 'Cancel'}</Button>
              <Button onClick={save} disabled={busy !== null} className="bg-charcoal text-white hover:bg-charcoal/90">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (isFr ? 'Enregistrer' : 'Save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
