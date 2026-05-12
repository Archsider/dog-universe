'use client';

import { useRef, useState, useCallback, type ChangeEvent } from 'react';
import { useDebouncedSave } from '../_hooks/useDebouncedSave';

interface InlineEditFieldProps {
  id: string;
  value: string;
  placeholder?: string;
  label?: string;
  rows?: number;
  locale: string;
  onSave: (value: string) => Promise<void>;
  disabled?: boolean;
}

export default function InlineEditField({
  id,
  value: initialValue,
  placeholder,
  label,
  rows = 3,
  locale,
  onSave,
  disabled,
}: InlineEditFieldProps) {
  const fr = locale !== 'en';
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const revert = useCallback(() => setValue(initialValue), [initialValue]);

  const { scheduleAutoSave, flush, saveState } = useDebouncedSave({
    onSave,
    onRevert: revert,
  });

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      scheduleAutoSave(e.target.value);
    },
    [scheduleAutoSave],
  );

  const handleBlur = useCallback(async () => {
    setFocused(false);
    await flush();
  }, [flush]);

  /** Public focus method — called from keyboard shortcut `E`. */
  const focus = useCallback(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  // Expose focus on the DOM node via data attribute for the keyboard handler
  // to locate the first editable field.
  return (
    <div className="space-y-1" data-inline-edit-field>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-gray-500">
          {label}
        </label>
      )}
      <div className="relative">
        <textarea
          ref={textareaRef}
          id={id}
          rows={rows}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled || saveState === 'saving'}
          className={[
            'w-full text-sm resize-none rounded-lg px-3 py-2 transition-all',
            'bg-transparent border',
            focused
              ? 'border-amber-400 ring-1 ring-amber-300 bg-white shadow-sm'
              : 'border-transparent hover:border-ivory-300 hover:bg-gray-50',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
          ].join(' ')}
        />
        {/* Save indicator */}
        <div className="absolute bottom-2 right-2 text-xs">
          {saveState === 'saving' && (
            <span className="text-amber-600 animate-pulse">…</span>
          )}
          {saveState === 'saved' && (
            <span className="text-green-600">{fr ? '✓ Enregistré' : '✓ Saved'}</span>
          )}
          {saveState === 'error' && (
            <span className="text-red-500">{fr ? 'Erreur' : 'Error'}</span>
          )}
        </div>
      </div>
      {/* Hint shown on focus */}
      {focused && !disabled && (
        <p className="text-xs text-gray-400">
          {fr ? 'Sauvegarde automatique en cours de frappe' : 'Auto-saved while typing'}
        </p>
      )}
    </div>
  );
}

// Re-export focus helper for keyboard handler
export type { InlineEditFieldProps };
