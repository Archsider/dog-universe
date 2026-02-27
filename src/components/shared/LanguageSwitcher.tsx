'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLocale = () => {
    const nextLocale = locale === 'fr' ? 'en' : 'fr';
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      className="flex items-center gap-1.5 text-sm font-medium text-charcoal/70 hover:text-charcoal h-8 px-2"
      title={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      <Globe className="h-4 w-4" />
      <span className="uppercase font-semibold">{locale === 'fr' ? 'EN' : 'FR'}</span>
    </Button>
  );
}
