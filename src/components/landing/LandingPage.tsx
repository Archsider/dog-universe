'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { PawPrint, Car, Scissors } from 'lucide-react';

interface LandingPageProps {
  locale: string;
}

export default function LandingPage({ locale }: LandingPageProps) {
  const t = useTranslations('landing');

  return (
    <div className="min-h-screen bg-[#FAF6F0]">
      {/* Header */}
      <header className="bg-white border-b border-[#F0D98A]/30 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center">
            <Image src="/logo.png" alt="Dog Universe" width={140} height={38} className="h-9 w-auto object-contain" priority />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              href={`/${locale}/auth/login`}
              className="text-sm font-medium text-charcoal/70 hover:text-charcoal transition-colors px-2 py-1.5"
            >
              {t('hero.login')}
            </Link>
            <Link
              href={`/${locale}/auth/register`}
              className="bg-gold-500 hover:bg-gold-600 text-white text-sm font-medium px-3 py-2 rounded-md transition-colors"
            >
              {t('hero.cta')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-10 md:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-gold-600 text-xs font-semibold tracking-widest uppercase mb-3">
            {t('hero.tagline')}
          </p>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-charcoal mb-4 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-base text-charcoal/70 mb-8 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/${locale}/auth/register`}
              className="bg-gold-500 hover:bg-gold-600 text-white font-semibold px-6 py-3.5 rounded-lg transition-colors shadow-gold text-base"
            >
              {t('hero.cta')}
            </Link>
            <Link
              href={`/${locale}/auth/login`}
              className="border border-gold-300 text-charcoal hover:bg-gold-50 font-semibold px-6 py-3.5 rounded-lg transition-colors text-base"
            >
              {t('hero.login')}
            </Link>
          </div>
        </div>
      </section>

      <div className="border-t border-[#F0D98A]/40" />

      {/* Services */}
      <section className="max-w-6xl mx-auto px-4 py-10 md:py-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-charcoal mb-2">{t('services.title')}</h2>
          <p className="text-charcoal/60">{t('services.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: PawPrint,
              title: t('services.boarding.title'),
              description: t('services.boarding.description'),
              color: 'text-gold-600',
              bg: 'bg-gold-50',
            },
            {
              icon: Car,
              title: t('services.taxi.title'),
              description: t('services.taxi.description'),
              color: 'text-blue-600',
              bg: 'bg-blue-50',
            },
            {
              icon: Scissors,
              title: t('services.grooming.title'),
              description: t('services.grooming.description'),
              color: 'text-purple-600',
              bg: 'bg-purple-50',
            },
          ].map((service, i) => {
            const Icon = service.icon;
            return (
              <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/30 p-5 shadow-card text-center">
                <div className={`inline-flex items-center justify-center h-12 w-12 rounded-full ${service.bg} mb-4`}>
                  <Icon className={`h-6 w-6 ${service.color}`} />
                </div>
                <h3 className="text-lg font-serif font-semibold text-charcoal mb-2">{service.title}</h3>
                <p className="text-charcoal/60 text-sm leading-relaxed">{service.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 py-10 md:py-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-charcoal mb-2">
            {locale === 'fr' ? 'Tarifs transparents' : 'Transparent Pricing'}
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/30 p-5 shadow-card">
            <h3 className="text-lg font-serif font-semibold text-charcoal mb-4 flex items-center gap-2">
              <PawPrint className="h-4 w-4 text-gold-500" />
              {locale === 'fr' ? 'Pension' : 'Boarding'}
            </h3>
            <ul className="space-y-2">
              <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Chien' : 'Dog'}</span>
                <span className="font-bold text-gold-700">120 MAD</span>
              </li>
              <li className="flex justify-between items-center py-1.5">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Chat' : 'Cat'}</span>
                <span className="font-bold text-gold-700">70 MAD</span>
              </li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/30 p-5 shadow-card">
            <h3 className="text-lg font-serif font-semibold text-charcoal mb-4 flex items-center gap-2">
              <Scissors className="h-4 w-4 text-purple-500" />
              {locale === 'fr' ? 'Bain (add-on pension)' : 'Bath (boarding add-on)'}
            </h3>
            <ul className="space-y-2">
              <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Petit chien' : 'Small dog'}</span>
                <span className="font-bold text-gold-700">100 MAD</span>
              </li>
              <li className="flex justify-between items-center py-1.5">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Grand chien' : 'Large dog'}</span>
                <span className="font-bold text-gold-700">150 MAD</span>
              </li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/30 p-5 shadow-card">
            <h3 className="text-lg font-serif font-semibold text-charcoal mb-4 flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-500" />
              Pet Taxi — Marrakech
            </h3>
            <ul className="space-y-2">
              <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Course standard' : 'Standard trip'}</span>
                <span className="font-bold text-gold-700">150 MAD</span>
              </li>
              <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Transport vétérinaire' : 'Vet transport'}</span>
                <span className="font-bold text-gold-700">300 MAD</span>
              </li>
              <li className="flex justify-between items-center py-1.5">
                <span className="text-sm text-charcoal/70">{locale === 'fr' ? 'Navette aéroport' : 'Airport transfer'}</span>
                <span className="font-bold text-gold-700">300 MAD</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
