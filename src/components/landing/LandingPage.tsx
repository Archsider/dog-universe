'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { PawPrint, Car, Scissors, Shield, Star, MessageCircle, Phone, Mail, MapPin, Clock } from 'lucide-react';

interface LandingPageProps {
  locale: string;
}

export default function LandingPage({ locale }: LandingPageProps) {
  const t = useTranslations('landing');

  return (
    <div className="min-h-screen bg-[#FAF6F0]">
      {/* Header */}
      <header className="bg-white border-b border-[#F0D98A]/30 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center">
            <Image src="/logo.png" alt="Dog Universe" width={150} height={50} className="object-contain" priority />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href={`/${locale}/auth/login`}
              className="text-sm font-medium text-charcoal/70 hover:text-charcoal transition-colors px-3 py-1.5"
            >
              {t('hero.login')}
            </Link>
            <Link
              href={`/${locale}/auth/register`}
              className="bg-gold-500 hover:bg-gold-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              {t('hero.cta')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-32">
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-gold-600 text-sm font-semibold tracking-widest uppercase mb-4">
            {t('hero.tagline')}
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-charcoal mb-6 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-lg text-charcoal/70 mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${locale}/auth/register`}
              className="bg-gold-500 hover:bg-gold-600 text-white font-semibold px-8 py-4 rounded-lg transition-colors shadow-gold text-lg"
            >
              {t('hero.cta')}
            </Link>
            <Link
              href={`/${locale}/auth/login`}
              className="border border-gold-300 text-charcoal hover:bg-gold-50 font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
            >
              {t('hero.login')}
            </Link>
          </div>
        </div>
      </section>

      {/* Decorative divider */}
      <div className="border-t border-[#F0D98A]/40" />

      {/* Services */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold text-charcoal mb-3">{t('services.title')}</h2>
          <p className="text-charcoal/60 text-lg">{t('services.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
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
              <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/30 p-8 shadow-card hover:shadow-card-hover transition-shadow text-center">
                <div className={`inline-flex items-center justify-center h-14 w-14 rounded-full ${service.bg} mb-5`}>
                  <Icon className={`h-7 w-7 ${service.color}`} />
                </div>
                <h3 className="text-xl font-serif font-semibold text-charcoal mb-3">{service.title}</h3>
                <p className="text-charcoal/60 leading-relaxed">{service.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Why us */}
      <section className="bg-white border-y border-[#F0D98A]/30 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold text-charcoal mb-3">{t('why.title')}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: t('why.trust.title'), desc: t('why.trust.description') },
              { icon: Star, title: t('why.quality.title'), desc: t('why.quality.description') },
              { icon: MessageCircle, title: t('why.communication.title'), desc: t('why.communication.description') },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-gold-100 mb-4">
                    <Icon className="h-6 w-6 text-gold-600" />
                  </div>
                  <h3 className="text-lg font-serif font-semibold text-charcoal mb-2">{item.title}</h3>
                  <p className="text-charcoal/60 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing highlight */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold text-charcoal mb-3">
            {locale === 'fr' ? 'Tarifs transparents' : 'Transparent Pricing'}
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-[#F0D98A]/30 p-8 shadow-card">
            <h3 className="text-xl font-serif font-semibold text-charcoal mb-6 flex items-center gap-2">
              <PawPrint className="h-5 w-5 text-gold-500" />
              {locale === 'fr' ? 'Toilettage (add-on pension)' : 'Grooming (boarding add-on)'}
            </h3>
            <ul className="space-y-3">
              <li className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-charcoal/70">{locale === 'fr' ? 'Petit chien' : 'Small dog'}</span>
                <span className="font-bold text-gold-700">100 MAD</span>
              </li>
              <li className="flex justify-between items-center py-2">
                <span className="text-charcoal/70">{locale === 'fr' ? 'Grand chien' : 'Large dog'}</span>
                <span className="font-bold text-gold-700">150 MAD</span>
              </li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/30 p-8 shadow-card">
            <h3 className="text-xl font-serif font-semibold text-charcoal mb-6 flex items-center gap-2">
              <Car className="h-5 w-5 text-blue-500" />
              Pet Taxi — Marrakech
            </h3>
            <ul className="space-y-3">
              <li className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-charcoal/70">{locale === 'fr' ? 'Course standard' : 'Standard trip'}</span>
                <span className="font-bold text-gold-700">150 MAD</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-charcoal/70">{locale === 'fr' ? 'Transport vétérinaire' : 'Vet transport'}</span>
                <span className="font-bold text-gold-700">300 MAD</span>
              </li>
              <li className="flex justify-between items-center py-2">
                <span className="text-charcoal/70">{locale === 'fr' ? 'Navette aéroport' : 'Airport transfer'}</span>
                <span className="font-bold text-gold-700">300 MAD</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-charcoal py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-serif font-bold text-gold-400 mb-3">{t('contact.title')}</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6 text-center">
            {[
              { icon: MapPin, text: t('contact.address') },
              { icon: Phone, text: t('contact.phone') },
              { icon: Mail, text: t('contact.email') },
              { icon: Clock, text: t('contact.hours') },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex flex-col items-center gap-2 text-white/80">
                  <Icon className="h-5 w-5 text-gold-400" />
                  <span className="text-sm">{item.text}</span>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-10">
            <Link
              href={`/${locale}/auth/register`}
              className="bg-gold-500 hover:bg-gold-400 text-white font-semibold px-8 py-4 rounded-lg transition-colors"
            >
              {t('hero.cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1A1A1A] py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} Dog Universe. {t('footer.rights')}.
          </p>
          <div className="flex gap-4">
            <Link href="#" className="text-white/40 hover:text-white/70 text-sm transition-colors">
              {t('footer.privacy')}
            </Link>
            <Link href="#" className="text-white/40 hover:text-white/70 text-sm transition-colors">
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
