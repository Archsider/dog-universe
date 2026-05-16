'use client';

// Visible list of vaccinations — both DRAFT cards (extracted-from-document
// review form) and CONFIRMED rows. Stateless display + form-bound mutators ;
// all I/O lives in the parent VaccinationSection.

import { Calendar, Sparkles, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Vaccination, DraftForm, VaccinationLabels } from '../vaccination-types';

interface Props {
  confirmedVax: Vaccination[];
  draftVax: Vaccination[];
  draftForms: Record<string, DraftForm>;
  confirmingIds: Set<string>;
  locale: string;
  labels: VaccinationLabels;
  onUpdateDraftForm: (draftId: string, form: DraftForm) => void;
  onConfirmDraft: (draftId: string) => void;
  onDismissDraft: (draftId: string) => void;
  onDeleteVax: (id: string) => void;
}

const toInputDate = (val: Date | string | null | undefined): string => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

export default function VaccinationViewList({
  confirmedVax, draftVax, draftForms, confirmingIds, locale, labels,
  onUpdateDraftForm, onConfirmDraft, onDismissDraft, onDeleteVax,
}: Props) {
  const fmtDate = (val: Date | string | null | undefined) => {
    if (!val) return '—';
    return new Date(val).toLocaleDateString(locale === 'fr' ? 'fr-MA' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const confidenceLabel = (draft: Vaccination) => {
    if (!draft.isAutoDetected) return null;
    const conf = draft._extractionConfidence;
    if (conf === 'HIGH') return { text: labels.confidenceHigh, color: 'text-green-600' };
    if (conf === 'MEDIUM') return { text: labels.confidenceMedium, color: 'text-amber-600' };
    return { text: labels.confidenceLow, color: 'text-orange-600' };
  };

  return (
    <>
      {/* Draft vaccination cards */}
      {draftVax.length > 0 && (
        <div className="space-y-3">
          {draftVax.map(draft => {
            const f = draftForms[draft.id] ?? {
              vaccineType: draft.vaccineType ?? '',
              date: toInputDate(draft.date),
              nextDueDate: toInputDate(draft.nextDueDate),
              comment: draft.comment ?? '',
            };
            const conf = confidenceLabel(draft);
            const isConfirming = confirmingIds.has(draft.id);
            const canConfirm = f.vaccineType.trim().length > 0 && f.date.length > 0;

            return (
              <div key={draft.id} className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                      <Clock className="h-3 w-3" />{labels.draftBadge}
                    </span>
                    {draft.isAutoDetected && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
                        <Sparkles className="h-3 w-3" />{labels.draftDetectedBadge}
                      </span>
                    )}
                    {conf && <span className={`text-xs ${conf.color}`}>{conf.text}</span>}
                  </div>
                  <button
                    onClick={() => onDismissDraft(draft.id)}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    {labels.ignoreBtn}
                  </button>
                </div>

                <p className="text-xs text-amber-800 mb-3">
                  {draft.isAutoDetected ? labels.draftHint : labels.draftHintManual}
                </p>

                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.vaccineType} *</Label>
                      <Input
                        value={f.vaccineType}
                        onChange={e => onUpdateDraftForm(draft.id, { ...f, vaccineType: e.target.value })}
                        placeholder={labels.typePlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.date} *</Label>
                      <Input
                        type="date"
                        value={f.date}
                        onChange={e => onUpdateDraftForm(draft.id, { ...f, date: e.target.value })}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.nextDueDate}</Label>
                      <Input
                        type="date"
                        value={f.nextDueDate}
                        onChange={e => onUpdateDraftForm(draft.id, { ...f, nextDueDate: e.target.value })}
                        placeholder={labels.nextDuePlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-charcoal/70">{labels.comment}</Label>
                      <Input
                        value={f.comment}
                        onChange={e => onUpdateDraftForm(draft.id, { ...f, comment: e.target.value })}
                        placeholder={labels.commentPlaceholder}
                        className="mt-1 text-sm h-8"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onConfirmDraft(draft.id)}
                    disabled={!canConfirm || isConfirming}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isConfirming ? labels.confirming : labels.confirmBtn}
                  </Button>
                  {!canConfirm && (
                    <p className="text-xs text-amber-700 text-center">{labels.fieldRequired}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmed vaccination list */}
      {confirmedVax.length > 0 && (
        <div className="space-y-2">
          {confirmedVax
            .slice()
            .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
            .map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg border border-ivory-200">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-2 h-2 rounded-full mt-2 bg-green-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal text-sm">{v.vaccineType}</p>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{fmtDate(v.date)}
                      </span>
                      {v.nextDueDate && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <AlertCircle className="h-3 w-3" />
                          Rappel : {fmtDate(v.nextDueDate)}
                        </span>
                      )}
                      {v.comment && <span>· {v.comment}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onDeleteVax(v.id)}
                  aria-label={locale === 'fr' ? 'Supprimer la vaccination' : 'Delete vaccination'}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
