'use client';

interface KeyboardHintsProps {
  locale: string;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: '↑ / K', fr: 'Réservation précédente', en: 'Previous booking' },
  { key: '↓ / J', fr: 'Réservation suivante', en: 'Next booking' },
  { key: 'E', fr: 'Éditer les notes', en: 'Edit notes' },
  { key: 'Esc', fr: 'Fermer le panneau', en: 'Close panel' },
  { key: '?', fr: 'Afficher / masquer les raccourcis', en: 'Toggle shortcuts' },
];

export default function KeyboardHints({ locale, onClose }: KeyboardHintsProps) {
  const fr = locale !== 'en';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-80 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={fr ? 'Raccourcis clavier' : 'Keyboard shortcuts'}
      >
        <h3 className="text-base font-semibold text-charcoal mb-4">
          {fr ? 'Raccourcis clavier' : 'Keyboard shortcuts'}
        </h3>
        <dl className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <kbd className="font-mono text-xs bg-gray-100 text-charcoal border border-gray-200 rounded px-2 py-0.5">
                {s.key}
              </kbd>
              <span className="text-sm text-gray-600">{fr ? s.fr : s.en}</span>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full text-sm text-gray-400 hover:text-charcoal"
        >
          {fr ? 'Fermer' : 'Close'}
        </button>
      </div>
    </div>
  );
}
