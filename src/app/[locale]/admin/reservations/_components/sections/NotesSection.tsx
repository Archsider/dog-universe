'use client';

import { useCallback } from 'react';
import InlineEditField from '../InlineEditField';
import { patchAdminBooking } from '@/lib/api-client';

interface NotesSectionProps {
  bookingId: string;
  notes: string | null;
  adminNotes: string | null;
  locale: string;
  onNotesChange?: (notes: string) => void;
}

export default function NotesSection({
  bookingId,
  notes,
  adminNotes,
  locale,
  onNotesChange,
}: NotesSectionProps) {
  const fr = locale !== 'en';

  const saveNotes = useCallback(async (value: string) => {
    const result = await patchAdminBooking(bookingId, { notes: value });
    if (!result.ok) throw new Error(result.error.code);
    onNotesChange?.(value);
  }, [bookingId, onNotesChange]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {fr ? 'Notes client' : 'Client notes'}
        </p>
        <InlineEditField
          id={`notes-${bookingId}`}
          value={notes ?? ''}
          placeholder={fr ? 'Ajouter une note client…' : 'Add a client note…'}
          rows={4}
          locale={locale}
          onSave={saveNotes}
        />
      </div>

      {adminNotes !== null && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {fr ? 'Dernier message admin' : 'Last admin message'}
          </p>
          <div className="text-sm bg-amber-50 border border-amber-100 rounded-lg p-3 text-amber-900">
            {adminNotes || <span className="text-gray-400">{fr ? '—' : '—'}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
