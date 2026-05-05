'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOCALES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English',  short: 'EN' },
  { code: 'ar', label: 'العربية',  short: 'AR' },
] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = LOCALES.find(l => l.code === locale) ?? LOCALES[0];

  const select = (code: string) => {
    setOpen(false);
    if (code !== locale) {
      router.replace(pathname, { locale: code as 'fr' | 'en' | 'ar' });
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-charcoal/70 hover:text-charcoal h-8 px-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase font-semibold">{current.short}</span>
      </Button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 z-50 w-36 bg-white border border-ivory-200 rounded-lg shadow-lg py-1"
        >
          {LOCALES.map(l => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === locale}
              onClick={() => select(l.code)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-ivory-50 text-charcoal"
              dir={l.code === 'ar' ? 'rtl' : 'ltr'}
            >
              <span>{l.label}</span>
              {l.code === locale && <Check className="h-3.5 w-3.5 text-gold-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
