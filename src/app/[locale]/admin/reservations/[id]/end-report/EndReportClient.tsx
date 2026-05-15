'use client';

// End-of-stay report form — interactive client component.
//
// Layout:
//   [ Form (5 sections + closing) ]  |  [ Live preview ]
//                                    |
//   [ Send button — gated by isFormReadyToSend ]
//
// On send → confirmation modal showing the destination client name + final
// preview. This anti-drame check prevents the "sent the wrong owner the
// wrong message" failure mode that the matching DELETE feature was built to
// recover from.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import {
  SECTIONS,
  buildEndStayReportMessage,
  emptyFormData,
  isFormReadyToSend,
  type EndStayReportFormData,
  type SectionKey,
} from '@/lib/end-stay-report';

interface PetInput {
  name: string;
  species: string;
  breed: string | null;
  dateOfBirth: string | null;
}

interface PreviousReport {
  id: string;
  sentAt: string;
  version: number;
  sentByName: string | null;
}

interface Props {
  locale: string;
  bookingId: string;
  booking: {
    serviceType: string;
    startDate: string | null;
    endDate: string | null;
  };
  client: { id: string; name: string; email: string };
  pets: PetInput[];
  previousReports: PreviousReport[];
}

const L = {
  fr: {
    intro: 'Remplissez les sections ci-dessous pour générer le rapport de fin de séjour.',
    alreadySent: 'Un rapport a déjà été envoyé pour cette réservation',
    sentBy: 'par',
    on: 'le',
    free: 'Commentaire libre',
    preview: 'Aperçu',
    closingTitle: 'Mot de fin',
    closingHint: 'Laissez vide pour la formule par défaut.',
    closingPlaceholder: 'Ex : Hâte de retrouver Chippie pour son prochain séjour ! — Mehdi',
    sendBtn: 'Envoyer au client',
    sending: 'Envoi...',
    blockedHint: 'Cochez au moins une option ou écrivez un commentaire dans une section pour activer l\'envoi.',
    confirmTitle: 'Envoyer le rapport ?',
    confirmDesc: (clientName: string, email: string) =>
      `Le rapport sera envoyé à ${clientName} (${email}) en notification in-app + email. Cette action est visible côté client.`,
    cancel: 'Annuler',
    confirmSend: 'Envoyer maintenant',
    sentToast: 'Rapport envoyé',
    errorToast: 'Erreur lors de l\'envoi',
    sendAgain: 'Renvoyer (un nouveau rapport sera créé)',
  },
  en: {
    intro: 'Fill in the sections below to generate the end-of-stay report.',
    alreadySent: 'A report has already been sent for this booking',
    sentBy: 'by',
    on: 'on',
    free: 'Free comment',
    preview: 'Preview',
    closingTitle: 'Closing note',
    closingHint: 'Leave empty for the default closing line.',
    closingPlaceholder: 'E.g. Looking forward to seeing Chippie again! — Mehdi',
    sendBtn: 'Send to client',
    sending: 'Sending...',
    blockedHint: 'Check at least one option or add a comment in any section to enable sending.',
    confirmTitle: 'Send the report?',
    confirmDesc: (clientName: string, email: string) =>
      `The report will be sent to ${clientName} (${email}) as an in-app notification + email. This is visible to the client.`,
    cancel: 'Cancel',
    confirmSend: 'Send now',
    sentToast: 'Report sent',
    errorToast: 'Error sending report',
    sendAgain: 'Send again (will create a new report row)',
  },
};

function petAge(dob: string | null, locale: string): string {
  if (!dob) return '';
  const ms = Date.now() - new Date(dob).getTime();
  const years = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  if (years < 1) {
    const months = Math.floor(ms / (30.4 * 24 * 3600 * 1000));
    return locale === 'fr' ? `${months} mois` : `${months}mo`;
  }
  return locale === 'fr' ? `${years} an${years > 1 ? 's' : ''}` : `${years}y`;
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === 'fr' ? 'fr-MA' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EndReportClient({
  locale,
  bookingId,
  booking,
  client,
  pets,
  previousReports,
}: Props) {
  const isFr = locale !== 'en';
  const labels = isFr ? L.fr : L.en;

  const [formData, setFormData] = useState<EndStayReportFormData>(emptyFormData());
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  const ready = useMemo(() => isFormReadyToSend(formData), [formData]);

  // Build the LIVE preview message using the same pure helper the server
  // will run. The two are guaranteed identical (same input → same output).
  const previewMessage = useMemo(() => {
    const petLabel =
      pets
        .map((p) => p.name)
        .filter(Boolean)
        .join(isFr ? ' et ' : ' and ') || (isFr ? 'votre compagnon' : 'your companion');
    const stayLabel =
      booking.startDate && booking.endDate
        ? isFr
          ? `Du ${fmtDate(booking.startDate, locale).split(',')[0]} au ${fmtDate(booking.endDate, locale).split(',')[0]}`
          : `From ${fmtDate(booking.startDate, locale).split(',')[0]} to ${fmtDate(booking.endDate, locale).split(',')[0]}`
        : isFr ? 'Séjour' : 'Stay';
    const serviceLabel = isFr
      ? booking.serviceType === 'BOARDING' ? 'Pension' : 'Pet Taxi'
      : booking.serviceType === 'BOARDING' ? 'Boarding' : 'Pet Taxi';
    return buildEndStayReportMessage(formData, {
      locale: isFr ? 'fr' : 'en',
      clientName: client.name || (isFr ? 'Client' : 'Client'),
      petLabel,
      stayLabel,
      serviceLabel,
    });
  }, [formData, pets, client.name, booking, isFr, locale]);

  function toggleCheckbox(sectionKey: SectionKey, checkboxId: string) {
    setFormData((prev) => {
      const section = prev.sections[sectionKey];
      const isChecked = section.checked.includes(checkboxId);
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [sectionKey]: {
            ...section,
            checked: isChecked
              ? section.checked.filter((id) => id !== checkboxId)
              : [...section.checked, checkboxId],
          },
        },
      };
    });
  }

  function updateFreeText(sectionKey: SectionKey, value: string) {
    setFormData((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionKey]: { ...prev.sections[sectionKey], freeText: value },
      },
    }));
  }

  function updateClosingNote(value: string) {
    setFormData((prev) => ({ ...prev, closingNote: value }));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/end-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Failed');
      }
      toast({ title: labels.sentToast, variant: 'success' });
      // Redirect back to the booking page — the new notification + report
      // will surface automatically in the messages section.
      router.push(`/${locale}/admin/reservations/${bookingId}`);
    } catch {
      toast({ title: labels.errorToast, variant: 'destructive' });
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  const hasPrevious = previousReports.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Form column ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm text-charcoal/70">{labels.intro}</p>

        {/* Pre-filled summary (read-only context). */}
        <div className="bg-gold-50/40 border border-gold-200/60 rounded-xl p-4 text-sm space-y-1">
          <div>
            <span className="text-charcoal/60">{isFr ? 'Client : ' : 'Client: '}</span>
            <strong>{client.name || client.email}</strong>
          </div>
          <div>
            <span className="text-charcoal/60">{isFr ? 'Animal(aux) : ' : 'Pet(s): '}</span>
            <strong>
              {pets
                .map((p) => {
                  const age = petAge(p.dateOfBirth, locale);
                  const parts = [p.name, p.breed, age].filter(Boolean);
                  return parts.join(' · ');
                })
                .join(', ')}
            </strong>
          </div>
          <div>
            <span className="text-charcoal/60">{isFr ? 'Service : ' : 'Service: '}</span>
            <strong>
              {booking.serviceType === 'BOARDING'
                ? (isFr ? 'Pension' : 'Boarding')
                : (isFr ? 'Pet Taxi' : 'Pet Taxi')}
            </strong>
          </div>
        </div>

        {/* Already-sent banner. */}
        {hasPrevious && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div>
                <strong>{labels.alreadySent}</strong> · {fmtDate(previousReports[0].sentAt, locale)}
                {previousReports[0].sentByName ? ` ${labels.sentBy} ${previousReports[0].sentByName}` : ''}
              </div>
              <div className="text-xs text-amber-700/80 mt-1">{labels.sendAgain}</div>
            </div>
          </div>
        )}

        {/* 5 sections. */}
        {SECTIONS.map((section) => {
          const data = formData.sections[section.key];
          return (
            <div
              key={section.key}
              className="bg-white rounded-xl border border-ivory-200 p-4 space-y-3"
            >
              <h3 className="font-semibold text-charcoal text-sm">
                {isFr ? section.titleFr : section.titleEn}
              </h3>
              <div className="flex flex-wrap gap-2">
                {section.checkboxes.map((cb) => {
                  const checked = data.checked.includes(cb.id);
                  return (
                    <label
                      key={cb.id}
                      className={
                        checked
                          ? 'cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-gold-100 border border-gold-400 px-3 py-1 text-xs text-charcoal'
                          : 'cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-300 px-3 py-1 text-xs text-charcoal/70 hover:border-gold-300'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCheckbox(section.key, cb.id)}
                        className="h-3 w-3 accent-gold-500"
                      />
                      {isFr ? cb.labelFr : cb.labelEn}
                    </label>
                  );
                })}
              </div>
              <Textarea
                value={data.freeText}
                onChange={(e) => updateFreeText(section.key, e.target.value)}
                placeholder={labels.free}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          );
        })}

        {/* Closing note. */}
        <div className="bg-white rounded-xl border border-ivory-200 p-4 space-y-2">
          <h3 className="font-semibold text-charcoal text-sm">{labels.closingTitle}</h3>
          <p className="text-xs text-charcoal/60">{labels.closingHint}</p>
          <Textarea
            value={formData.closingNote}
            onChange={(e) => updateClosingNote(e.target.value)}
            placeholder={labels.closingPlaceholder}
            rows={2}
            className="text-sm resize-none"
          />
        </div>

        {/* Send. */}
        <div className="space-y-2">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!ready || submitting}
            size="lg"
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {labels.sendBtn}
          </Button>
          {!ready && (
            <p className="text-xs text-amber-700">{labels.blockedHint}</p>
          )}
        </div>
      </div>

      {/* ── Preview column ─────────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm text-charcoal/60">
            <Eye className="h-4 w-4" />
            <span>{labels.preview}</span>
          </div>
          <pre className="text-sm text-charcoal whitespace-pre-wrap font-sans leading-relaxed">
            {previewMessage}
          </pre>
        </div>
      </div>

      {/* ── Confirm modal ──────────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.confirmDesc(client.name || (isFr ? 'le client' : 'the client'), client.email)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {labels.sending}
                </>
              ) : (
                labels.confirmSend
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
