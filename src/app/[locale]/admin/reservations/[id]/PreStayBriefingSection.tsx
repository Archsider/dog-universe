// Pre-stay briefing — admin read-only view of what the owner submitted
// J-2 before boarding (food / toys / fears / routine / vet / free text).

import { parseBriefingForm, summarizeBriefing } from '@/lib/pre-stay-briefing';
import { ClipboardList, Clock } from 'lucide-react';

interface Props {
  briefing: {
    formData: string | null;
    submittedAt: Date | null;
    invitedAt: Date;
  } | null;
  locale: string;
}

export default function PreStayBriefingSection({ briefing, locale }: Props) {
  // Nothing scheduled, no row created yet — skip entirely.  The admin will
  // see this section pop in only after the cron has fired the J-2 invite.
  if (!briefing) return null;

  const fr = locale === 'fr';
  const form = parseBriefingForm(briefing.formData);
  const rows = summarizeBriefing(form, fr ? 'fr' : 'en');
  const submittedAtStr = briefing.submittedAt
    ? briefing.submittedAt.toLocaleString(fr ? 'fr-FR' : 'en-US', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;
  const invitedAtStr = briefing.invitedAt.toLocaleString(fr ? 'fr-FR' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-xl border border-[#C9A84C]/30 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-[#C9A84C]/15 bg-[#FFF9E8]/50 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[#8B6914]" />
        <h3 className="font-semibold text-sm text-charcoal flex-1">
          {fr ? 'Briefing pré-séjour' : 'Pre-stay briefing'}
        </h3>
        {submittedAtStr ? (
          <span className="text-xs text-emerald-700 font-medium">
            ✓ {fr ? 'Reçu' : 'Received'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <Clock className="h-3 w-3" /> {fr ? 'En attente' : 'Pending'}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {!submittedAtStr && (
          <p className="text-sm text-charcoal/60 italic">
            {fr
              ? `Le client a été invité à remplir le briefing le ${invitedAtStr}. Pas encore reçu.`
              : `The client was invited to fill the briefing on ${invitedAtStr}. Not received yet.`}
          </p>
        )}

        {submittedAtStr && rows.length === 0 && (
          <p className="text-sm text-charcoal/60 italic">
            {fr
              ? 'Le client a soumis un briefing vide.'
              : 'The client submitted an empty briefing.'}
          </p>
        )}

        {submittedAtStr && rows.length > 0 && (
          <>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B6914]">
                    {row.label}
                  </p>
                  <p className="text-sm text-charcoal mt-0.5 whitespace-pre-wrap">{row.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-charcoal/40 mt-4">
              {fr ? `Soumis le ${submittedAtStr}` : `Submitted on ${submittedAtStr}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
