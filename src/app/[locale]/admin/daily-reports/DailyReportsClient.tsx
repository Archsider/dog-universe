'use client';

// Daily Report Card admin orchestrator.
//
// Renders one card per (pet, day) — DRAFT cards are editable inline (photos,
// emojis, note), SENT / SKIPPED are read-only.  All actions hit the
// /api/admin/daily-reports/[id]/{patch,send,skip} routes.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Send, X, MessageCircle, Mail, MailX, Check, Calendar } from 'lucide-react';
import { EMOJI_OPTIONS } from '@/lib/daily-reports';

interface ReportRow {
  id: string;
  bookingId: string;
  petId: string;
  date: string;
  photoUrls: string[];
  moodEmoji: string | null;
  foodEmoji: string | null;
  sleepEmoji: string | null;
  playEmoji: string | null;
  note: string | null;
  status: string;
  sentAt: string | null;
  skipReason: string | null;
  emailFailed: boolean;
  pet: {
    name: string;
    species: string;
    photoUrl: string | null;
    isPermanentResident: boolean;
  };
  booking: {
    client: {
      id: string;
      name: string | null;
      firstName: string | null;
      email: string | null;
      phone: string | null;
      isWalkIn: boolean;
    };
  };
}

interface Props {
  locale: string;
  date: string;
  initialReports: ReportRow[];
  petsInPensionCount: number;
  canTriggerCron: boolean;
}

const NOTE_MAX = 280;

export default function DailyReportsClient({
  locale,
  date,
  initialReports,
  petsInPensionCount,
  canTriggerCron,
}: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [busyTrigger, setBusyTrigger] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const drafts = reports.filter(r => r.status === 'DRAFT');
  const sent = reports.filter(r => r.status === 'SENT');
  const skipped = reports.filter(r => r.status === 'SKIPPED');

  function patchLocal(id: string, patch: Partial<ReportRow>) {
    setReports(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">
            {fr ? 'Cartes du jour' : 'Daily Cards'}
          </h1>
          <p className="text-sm text-charcoal/60 mt-0.5">
            {fr
              ? `Une carte à envoyer au propriétaire pour chaque animal en pension`
              : `One card to send to the owner for every pet in boarding`}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFF9E8] border border-[#F0D98A]/60">
          <Calendar className="h-4 w-4 text-[#8B6914]" />
          <span className="text-sm font-medium text-[#2C2C2C]">{date}</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiPill label={fr ? 'À envoyer' : 'To send'}    value={drafts.length}  tone="draft" />
        <KpiPill label={fr ? 'Envoyées'  : 'Sent'}       value={sent.length}    tone="sent" />
        <KpiPill label={fr ? 'Ignorées'  : 'Skipped'}    value={skipped.length} tone="muted" />
      </div>

      {reports.length === 0 && petsInPensionCount === 0 && (
        <div className="rounded-2xl border border-dashed border-[#C4974A]/40 p-8 text-center bg-white">
          <p className="text-4xl mb-2" aria-hidden>🌙</p>
          <p className="text-sm text-charcoal/60">
            {fr
              ? 'Aucun animal en pension aujourd\'hui — pas de carte à envoyer.'
              : 'No pets in boarding today — nothing to send.'}
          </p>
          <p className="text-xs text-charcoal/40 mt-2">
            {fr
              ? 'Les brouillons sont créés automatiquement à 16h Casa.'
              : 'Drafts are created automatically at 16:00 Casablanca time.'}
          </p>
        </div>
      )}

      {reports.length === 0 && petsInPensionCount > 0 && (
        <div className="rounded-2xl border border-dashed border-amber-300 p-6 sm:p-8 text-center bg-amber-50/50">
          <p className="text-4xl mb-2" aria-hidden>⏳</p>
          <p className="text-sm text-charcoal font-medium">
            {fr
              ? `${petsInPensionCount} animal·aux en pension — brouillons pas encore générés.`
              : `${petsInPensionCount} pet${petsInPensionCount > 1 ? 's' : ''} in boarding — drafts not generated yet.`}
          </p>
          <p className="text-xs text-charcoal/60 mt-2">
            {fr
              ? 'Le cron tourne automatiquement à 16h Casa. Tu peux aussi générer maintenant :'
              : 'The cron runs automatically at 16:00 Casablanca time. Or trigger it now:'}
          </p>
          {canTriggerCron && (
            <button
              type="button"
              onClick={async () => {
                if (busyTrigger) return;
                setBusyTrigger(true);
                setTriggerError(null);
                try {
                  const r = await fetch('/api/admin/cron-trigger/daily-report-drafts', { method: 'POST' });
                  if (!r.ok) {
                    setTriggerError(fr ? 'Erreur — réessayez' : 'Error — try again');
                    return;
                  }
                  router.refresh();
                } finally {
                  setBusyTrigger(false);
                }
              }}
              disabled={busyTrigger}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium"
            >
              {busyTrigger
                ? (fr ? 'Génération…' : 'Generating…')
                : (fr ? 'Générer les brouillons maintenant' : 'Generate drafts now')}
            </button>
          )}
          {!canTriggerCron && (
            <p className="text-xs text-charcoal/50 italic mt-3">
              {fr ? '(Le déclenchement manuel est réservé au SUPERADMIN)' : '(Manual trigger is SUPERADMIN-only)'}
            </p>
          )}
          {triggerError && (
            <p className="text-xs text-red-600 mt-2">{triggerError}</p>
          )}
        </div>
      )}

      {/* DRAFTS — actionable cards */}
      {drafts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal/60 mb-3">
            {fr ? `À envoyer (${drafts.length})` : `To send (${drafts.length})`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map(r => (
              <DraftCard
                key={r.id}
                report={r}
                fr={fr}
                pending={pending}
                onPatchLocal={patch => patchLocal(r.id, patch)}
                onPersist={() => startTransition(() => router.refresh())}
              />
            ))}
          </div>
        </section>
      )}

      {/* SENT — collapsible-style summary cards */}
      {sent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal/60 mb-3">
            {fr ? `Envoyées (${sent.length})` : `Sent (${sent.length})`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sent.map(r => <SentCard key={r.id} report={r} fr={fr} />)}
          </div>
        </section>
      )}

      {/* SKIPPED */}
      {skipped.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal/60 mb-3">
            {fr ? `Ignorées (${skipped.length})` : `Skipped (${skipped.length})`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skipped.map(r => (
              <div key={r.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                <div className="text-sm font-semibold text-gray-700">{r.pet.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{r.booking.client.name}</div>
                {r.skipReason && (
                  <p className="text-xs text-gray-500 italic mt-2">« {r.skipReason} »</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiPill({ label, value, tone }: { label: string; value: number; tone: 'draft' | 'sent' | 'muted' }) {
  const palette = tone === 'draft'
    ? 'bg-[#C9A84C]/10 text-[#8B6914] border-[#C9A84C]/40'
    : tone === 'sent'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <div className={`rounded-xl border p-3 ${palette}`}>
      <div className="text-2xl font-serif font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function DraftCard({
  report, fr, pending, onPatchLocal, onPersist,
}: {
  report: ReportRow;
  fr: boolean;
  pending: boolean;
  onPatchLocal: (patch: Partial<ReportRow>) => void;
  onPersist: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchServer(patch: Partial<ReportRow>) {
    onPatchLocal(patch);
    try {
      const r = await fetch(`/api/admin/daily-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('PATCH_FAILED');
    } catch {
      setError(fr ? 'Sauvegarde échouée — réessayez.' : 'Save failed — please retry.');
    }
  }

  async function uploadPhoto(file: File) {
    if (report.photoUrls.length >= 3) {
      setError(fr ? 'Maximum 3 photos.' : 'Maximum 3 photos.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'stay-photo');
    try {
      const r = await fetch('/api/uploads', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error ?? 'UPLOAD_FAILED');
      await patchServer({ photoUrls: [...report.photoUrls, j.url] });
    } catch {
      setError(fr ? 'Photo non envoyée — réessayez.' : 'Upload failed — please retry.');
    }
  }

  async function removePhoto(idx: number) {
    const next = report.photoUrls.filter((_, i) => i !== idx);
    await patchServer({ photoUrls: next });
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/daily-reports/${report.id}/send`, {
        method: 'POST',
      });
      const j = await r.json();
      if (!r.ok) {
        const map: Record<string, string> = {
          NEEDS_PHOTO_OR_NOTE: fr ? 'Ajoutez au moins une photo, un emoji ou un mot.' : 'Add at least a photo, emoji or note.',
          NOT_DRAFT: fr ? 'Carte déjà envoyée.' : 'Card already sent.',
        };
        setError(map[j.error] ?? (fr ? 'Envoi échoué.' : 'Send failed.'));
        return;
      }
      // Pop WhatsApp share if available + refresh server state
      if (j.whatsappUrl) window.open(j.whatsappUrl, '_blank', 'noopener');
      onPersist();
    } catch {
      setError(fr ? 'Erreur réseau.' : 'Network error.');
    } finally {
      setSending(false);
    }
  }

  async function skip() {
    if (!confirm(fr ? `Ignorer la carte de ${report.pet.name} ? Aucun mail ne sera envoyé.` : `Skip the card for ${report.pet.name}? No email will be sent.`)) return;
    setSending(true);
    try {
      await fetch(`/api/admin/daily-reports/${report.id}/skip`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      onPersist();
    } catch {
      setError(fr ? 'Action échouée.' : 'Action failed.');
    } finally {
      setSending(false);
    }
  }

  const hasContent = report.photoUrls.length > 0
    || report.note?.trim()
    || report.moodEmoji || report.foodEmoji || report.sleepEmoji || report.playEmoji;

  return (
    <div className="rounded-2xl border border-[#C4974A]/30 bg-white shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#C4974A]/15 bg-[#FFF9E8]/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg" aria-hidden>{report.pet.species === 'CAT' ? '🐱' : '🐶'}</span>
          <div className="min-w-0">
            <div className="font-semibold text-charcoal truncate">{report.pet.name}</div>
            <div className="text-xs text-charcoal/60 truncate">
              {report.booking.client.firstName || report.booking.client.name || '—'}
              {report.pet.isPermanentResident && (
                <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-semibold">🏠</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {report.booking.client.email && !report.booking.client.email.endsWith('@dog-universe.local') ? (
            <span title={fr ? 'Email envoyé à la signature' : 'Email sent on send'}><Mail className="h-4 w-4 text-emerald-600" /></span>
          ) : (
            <span title={fr ? 'Pas d\'email — WhatsApp uniquement' : 'No email — WhatsApp only'}><MailX className="h-4 w-4 text-gray-400" /></span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Photos */}
        <div>
          <p className="text-xs font-semibold text-charcoal/70 mb-2">{fr ? 'Photos' : 'Photos'} ({report.photoUrls.length}/3)</p>
          <div className="flex flex-wrap gap-2">
            {report.photoUrls.map((url, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] shadow opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {report.photoUrls.length < 3 && (
              <label className="h-20 w-20 rounded-lg border-2 border-dashed border-[#C4974A]/40 flex items-center justify-center cursor-pointer hover:bg-[#FFF9E8] transition-colors">
                <Camera className="h-5 w-5 text-[#8B6914]" />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {/* Emojis 2x2 */}
        <div className="grid grid-cols-2 gap-2">
          <EmojiPicker label={fr ? 'Humeur' : 'Mood'}     options={EMOJI_OPTIONS.mood}  value={report.moodEmoji}  onChange={v => patchServer({ moodEmoji: v })} />
          <EmojiPicker label={fr ? 'Appétit' : 'Appetite'} options={EMOJI_OPTIONS.food}  value={report.foodEmoji}  onChange={v => patchServer({ foodEmoji: v })} />
          <EmojiPicker label={fr ? 'Sommeil' : 'Sleep'}    options={EMOJI_OPTIONS.sleep} value={report.sleepEmoji} onChange={v => patchServer({ sleepEmoji: v })} />
          <EmojiPicker label={fr ? 'Jeu' : 'Play'}         options={EMOJI_OPTIONS.play}  value={report.playEmoji}  onChange={v => patchServer({ playEmoji: v })} />
        </div>

        {/* Note */}
        <div>
          <p className="text-xs font-semibold text-charcoal/70 mb-1">
            {fr ? 'Un mot personnel' : 'A personal note'}
            <span className="text-charcoal/40 ml-1.5 font-normal">({(report.note ?? '').length}/{NOTE_MAX})</span>
          </p>
          <textarea
            value={report.note ?? ''}
            onChange={e => onPatchLocal({ note: e.target.value.slice(0, NOTE_MAX) })}
            onBlur={e => patchServer({ note: e.target.value.slice(0, NOTE_MAX) || null })}
            placeholder={fr ? `${report.pet.name} a passé une belle journée…` : `${report.pet.name} had a wonderful day…`}
            rows={2}
            maxLength={NOTE_MAX}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
          />
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={send}
            disabled={sending || pending || !hasContent}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            <Send className="h-4 w-4" />
            {sending ? (fr ? 'Envoi…' : 'Sending…') : (fr ? 'Envoyer' : 'Send')}
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={sending || pending}
            className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-600 transition-colors"
            title={fr ? 'Ignorer cette carte' : 'Skip this card'}
          >
            {fr ? 'Ignorer' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmojiPicker({ label, options, value, onChange }: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-2">
      <p className="text-[10px] font-semibold text-charcoal/60 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(e => {
          const active = value === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => onChange(active ? null : e)}
              className={`text-lg h-8 w-8 rounded-md flex items-center justify-center transition-all ${
                active
                  ? 'bg-[#C9A84C] ring-2 ring-[#C9A84C]/30'
                  : 'hover:bg-gray-100'
              }`}
              aria-pressed={active}
            >
              {e}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SentCard({ report, fr }: { report: ReportRow; fr: boolean }) {
  const time = report.sentAt
    ? new Date(report.sentAt).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="rounded-xl border border-emerald-200 p-3 bg-emerald-50/40">
      <div className="flex items-start gap-2">
        <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-charcoal">{report.pet.name}</div>
            <div className="text-xs text-emerald-700">{time}</div>
          </div>
          <div className="text-xs text-charcoal/60 truncate">{report.booking.client.name}</div>
          {report.note && <p className="text-xs text-charcoal/70 italic mt-1 line-clamp-2">« {report.note} »</p>}
          {report.emailFailed && (
            <p className="text-xs text-red-700 mt-1 flex items-center gap-1">
              <MailX className="h-3 w-3" /> {fr ? 'Email échoué' : 'Email failed'}
            </p>
          )}
        </div>
      </div>
      {report.booking.client.phone && (
        <a
          href={`https://wa.me/${report.booking.client.phone.replace(/[^\d]/g, '').replace(/^0/, '212')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900"
        >
          <MessageCircle className="h-3 w-3" /> WhatsApp
        </a>
      )}
    </div>
  );
}
