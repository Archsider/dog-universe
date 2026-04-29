'use client';

import { Sparkles, MessageCircle, Car, Scissors, FileText } from 'lucide-react';

export interface AddonRequest {
  requestId: string;
  serviceType: 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';
  message: string;
  createdAt: string;
}

interface Props {
  bookingRef: string;
  clientName: string | null;
  clientPhone: string | null;
  requests: AddonRequest[];
  locale: string;
}

const SERVICE_LABELS: Record<string, { fr: string; en: string; icon: typeof Car }> = {
  PET_TAXI:   { fr: 'Pet Taxi',    en: 'Pet Taxi',  icon: Car },
  TOILETTAGE: { fr: 'Toilettage',  en: 'Grooming',  icon: Scissors },
  AUTRE:      { fr: 'Autre',       en: 'Other',     icon: FileText },
};

function cleanPhoneForWhatsApp(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

function buildWhatsAppUrl(phone: string, locale: string, bookingRef: string, clientName: string | null, serviceLabel: string, message: string): string {
  const digits = cleanPhoneForWhatsApp(phone);
  const greetingFr = clientName ? `Bonjour ${clientName},` : 'Bonjour,';
  const greetingEn = clientName ? `Hello ${clientName},` : 'Hello,';
  const text = locale === 'fr'
    ? `${greetingFr} concernant votre réservation #${bookingRef}, nous avons bien reçu votre demande pour ${serviceLabel}.${message ? ` Vous nous avez précisé : « ${message} ».` : ''} Nous revenons vers vous rapidement.`
    : `${greetingEn} regarding your booking #${bookingRef}, we received your request for ${serviceLabel}.${message ? ` You mentioned: "${message}".` : ''} We'll get back to you shortly.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function AddonRequestsSection({ bookingRef, clientName, clientPhone, requests, locale }: Props) {
  if (requests.length === 0) return null;

  const isFr = locale === 'fr';
  const fmtLocale = isFr ? 'fr-MA' : 'en-GB';

  return (
    <div className="bg-white rounded-xl border border-gold-200 p-5 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-gold-50">
          <Sparkles className="h-4 w-4 text-gold-600" />
        </div>
        <h3 className="font-semibold text-charcoal text-sm">
          {isFr ? 'Demandes de services supplémentaires' : 'Additional service requests'}
        </h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-gold-100 text-gold-700 font-medium">
          {requests.length}
        </span>
      </div>

      <div className="space-y-2">
        {requests.map((req) => {
          const cfg = SERVICE_LABELS[req.serviceType];
          const Icon = cfg?.icon ?? FileText;
          const serviceLabel = cfg ? (isFr ? cfg.fr : cfg.en) : req.serviceType;
          const dateStr = new Date(req.createdAt).toLocaleString(fmtLocale, {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          });

          return (
            <div key={req.requestId} className="border border-ivory-200 rounded-lg p-3 bg-ivory-50/30">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white border border-gold-200 flex-shrink-0">
                  <Icon className="h-4 w-4 text-gold-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-charcoal text-sm">{serviceLabel}</p>
                    <span className="text-xs text-gray-400">{dateStr}</span>
                  </div>
                  {req.message && (
                    <p className="text-sm text-charcoal/80 mt-1 italic">« {req.message} »</p>
                  )}
                </div>
                {clientPhone && (
                  <a
                    href={buildWhatsAppUrl(clientPhone, locale, bookingRef, clientName, serviceLabel, req.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors border border-green-200 flex-shrink-0"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
