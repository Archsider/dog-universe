import type { Metadata } from 'next';
import Link from 'next/link';

type Params = { locale: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';
  const isFr = locale === 'fr';
  return {
    title: isFr
      ? "Conditions Générales d'Utilisation — Dog Universe"
      : 'Terms & Conditions — Dog Universe',
    description: isFr
      ? "Conditions d'utilisation des services Dog Universe : pension, pet taxi et toilettage à Marrakech."
      : 'Terms of service for Dog Universe: pet boarding, pet taxi and grooming in Marrakech.',
    alternates: { canonical: `${baseUrl}/${locale}/terms` },
  };
}

export default async function TermsPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const isFr = locale === 'fr';

  return (
    <div className="min-h-screen bg-[#FAF6F0]">
      <header className="bg-white border-b border-[#F0D98A]/30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center">
          <Link href={`/${locale}`} className="text-sm text-neutral-500 hover:text-charcoal transition-colors">
            ← {isFr ? 'Retour' : 'Back'}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif font-bold text-charcoal mb-2">
          {isFr ? "Conditions Générales d'Utilisation" : 'Terms & Conditions'}
        </h1>
        <p className="text-sm text-neutral-500 mb-10">
          {isFr ? 'Dernière mise à jour : avril 2026' : 'Last updated: April 2026'}
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-charcoal/80 leading-relaxed">

          {/* 1 — Objet */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '1. Objet' : '1. Purpose'}
            </h2>
            {isFr ? (
              <p>
                Les présentes Conditions Générales d&apos;Utilisation (CGU) régissent l&apos;accès et
                l&apos;utilisation de la plateforme Dog Universe, ainsi que les services proposés :
                pension pour animaux (chiens et chats), pet taxi et toilettage à Marrakech, Maroc.
                En créant un compte et en effectuant une réservation, vous acceptez ces conditions
                dans leur intégralité.
              </p>
            ) : (
              <p>
                These Terms & Conditions govern access to and use of the Dog Universe platform, and the
                services offered: pet boarding (dogs and cats), pet taxi, and grooming in Marrakech, Morocco.
                By creating an account and making a booking, you agree to these terms in full.
              </p>
            )}
          </section>

          {/* 2 — Services */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '2. Services proposés' : '2. Services Offered'}
            </h2>
            {isFr ? (
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Pension :</strong> hébergement de chiens et chats au sein de nos installations
                  à Marrakech. Tarif journalier : 120 MAD/chien, 70 MAD/chat. Les tarifs peuvent évoluer ;
                  le tarif applicable est celui affiché lors de la confirmation de la réservation.
                </li>
                <li>
                  <strong>Pet taxi :</strong> transport de votre animal dans Marrakech (course standard,
                  transport vétérinaire, navette aéroport). Disponible du lundi au samedi, de 10h à 17h
                  uniquement. Non disponible le dimanche.
                </li>
                <li>
                  <strong>Toilettage / bain (add-on pension) :</strong> service proposé en complément
                  d&apos;un séjour en pension. Tarif : 100 MAD (petit chien), 150 MAD (grand chien).
                </li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Boarding:</strong> accommodation for dogs and cats at our Marrakech facility.
                  Daily rate: 120 MAD/dog, 70 MAD/cat. Rates may change; the rate applicable is the one
                  shown at booking confirmation.
                </li>
                <li>
                  <strong>Pet taxi:</strong> pet transport within Marrakech (standard trip, vet transport,
                  airport transfer). Available Monday to Saturday, 10:00–17:00 only. Not available on Sundays.
                </li>
                <li>
                  <strong>Grooming / bath (boarding add-on):</strong> available as a complement to a boarding
                  stay. Rate: 100 MAD (small dog), 150 MAD (large dog).
                </li>
              </ul>
            )}
          </section>

          {/* 3 — Réservations */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '3. Réservations' : '3. Bookings'}
            </h2>
            {isFr ? (
              <>
                <p className="mb-3">
                  Toute réservation effectuée via la plateforme est soumise à validation par notre équipe.
                  Elle n&apos;est confirmée qu&apos;après réception d&apos;une notification de confirmation.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Les réservations ne peuvent être effectuées qu&apos;à des dates futures.</li>
                  <li>
                    Les réservations de pet taxi sont soumises aux contraintes horaires et d&apos;indisponibilité
                    du dimanche mentionnées à l&apos;article 2.
                  </li>
                  <li>
                    En cas d&apos;indisponibilité, nous vous en informerons dans les meilleurs délais
                    et la réservation sera annulée sans frais.
                  </li>
                </ul>
              </>
            ) : (
              <>
                <p className="mb-3">
                  All bookings made through the platform are subject to validation by our team. A booking
                  is only confirmed upon receipt of a confirmation notification.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Bookings can only be made for future dates.</li>
                  <li>
                    Pet taxi bookings are subject to the time slot and Sunday unavailability constraints
                    described in section 2.
                  </li>
                  <li>
                    In the event of unavailability, we will notify you as soon as possible and the booking
                    will be cancelled at no charge.
                  </li>
                </ul>
              </>
            )}
          </section>

          {/* 4 — Santé et vaccinations */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '4. Santé et vaccinations' : '4. Health & Vaccinations'}
            </h2>
            {isFr ? (
              <p>
                Pour le bien-être de tous les animaux accueillis, les vaccinations obligatoires doivent être
                à jour au moment du séjour. Vous êtes responsable de l&apos;exactitude des informations
                médicales renseignées sur la plateforme. Dog Universe se réserve le droit de refuser
                l&apos;accueil d&apos;un animal présentant des symptômes de maladie contagieuse.
              </p>
            ) : (
              <p>
                For the well-being of all animals in our care, mandatory vaccinations must be up to date at
                the time of the stay. You are responsible for the accuracy of the medical information entered
                on the platform. Dog Universe reserves the right to refuse admission of an animal showing
                symptoms of contagious illness.
              </p>
            )}
          </section>

          {/* 5 — Tarifs et facturation */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '5. Tarifs et facturation' : '5. Pricing & Invoicing'}
            </h2>
            {isFr ? (
              <p>
                Tous les tarifs sont exprimés en Dirhams marocains (MAD), toutes taxes comprises. Une facture
                est générée à l&apos;issue de chaque service et accessible depuis votre espace client.
                Le paiement est dû selon les modalités convenues avec notre équipe.
              </p>
            ) : (
              <p>
                All prices are in Moroccan Dirhams (MAD), inclusive of applicable taxes. An invoice is
                generated after each service and accessible from your client portal. Payment is due
                according to the terms agreed with our team.
              </p>
            )}
          </section>

          {/* 6 — Annulation */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '6. Annulation' : '6. Cancellation'}
            </h2>
            {isFr ? (
              <p>
                Vous pouvez annuler une réservation en attente ou confirmée directement depuis votre
                espace client, ou en nous contactant à{' '}
                <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                  contact@doguniverse.ma
                </a>
                . Les conditions d&apos;annulation (délais, éventuels frais) vous seront précisées par
                notre équipe selon le contexte de la réservation.
              </p>
            ) : (
              <p>
                You may cancel a pending or confirmed booking directly from your client portal, or by
                contacting us at{' '}
                <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                  contact@doguniverse.ma
                </a>
                . Cancellation terms (notice period, potential fees) will be communicated by our team
                based on the specific booking.
              </p>
            )}
          </section>

          {/* 7 — Responsabilité */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '7. Responsabilité' : '7. Liability'}
            </h2>
            {isFr ? (
              <p>
                Dog Universe s&apos;engage à apporter le plus grand soin à votre animal pendant son séjour.
                Notre responsabilité ne saurait être engagée pour des conditions médicales préexistantes
                non déclarées, ou pour des événements indépendants de notre volonté. Tout incident survenant
                pendant un séjour vous sera signalé sans délai.
              </p>
            ) : (
              <p>
                Dog Universe is committed to providing the highest standard of care for your pet during their
                stay. We cannot be held liable for undisclosed pre-existing medical conditions or for events
                beyond our control. Any incident occurring during a stay will be reported to you without delay.
              </p>
            )}
          </section>

          {/* 8 — Programme fidélité */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '8. Programme de fidélité' : '8. Loyalty Programme'}
            </h2>
            {isFr ? (
              <p>
                Dog Universe propose un programme de fidélité par grades (Bronze, Silver, Gold, Platinum)
                donnant accès à des avantages exclusifs. Les grades sont calculés automatiquement sur la
                base de votre historique de séjours. Dog Universe se réserve le droit de modifier les
                conditions et avantages du programme à tout moment, avec information préalable des clients.
              </p>
            ) : (
              <p>
                Dog Universe offers a tiered loyalty programme (Bronze, Silver, Gold, Platinum) providing
                access to exclusive benefits. Grades are calculated automatically based on your stay history.
                Dog Universe reserves the right to modify programme conditions and benefits at any time,
                with prior notice to clients.
              </p>
            )}
          </section>

          {/* 9 — Propriété intellectuelle */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '9. Propriété intellectuelle' : '9. Intellectual Property'}
            </h2>
            {isFr ? (
              <p>
                L&apos;ensemble des éléments de la plateforme (logo, textes, design, code) sont la propriété
                exclusive de Dog Universe. Toute reproduction ou utilisation sans autorisation écrite est
                interdite.
              </p>
            ) : (
              <p>
                All elements of the platform (logo, content, design, code) are the exclusive property of
                Dog Universe. Any reproduction or use without prior written authorisation is prohibited.
              </p>
            )}
          </section>

          {/* 10 — Droit applicable */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '10. Droit applicable et juridiction' : '10. Governing Law & Jurisdiction'}
            </h2>
            {isFr ? (
              <p>
                Les présentes CGU sont régies par le droit marocain. Tout litige sera soumis à la juridiction
                compétente de Marrakech, Maroc, sauf disposition légale contraire.
              </p>
            ) : (
              <p>
                These Terms are governed by Moroccan law. Any dispute shall be submitted to the competent
                courts of Marrakech, Morocco, unless otherwise required by applicable law.
              </p>
            )}
          </section>

          {/* 11 — Contact */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '11. Contact' : '11. Contact'}
            </h2>
            <p>
              {isFr ? 'Pour toute question relative à ces conditions :' : 'For any questions regarding these terms:'}
            </p>
            <p className="mt-2">
              <strong>Dog Universe</strong> — Marrakech, Maroc
              <br />
              <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                contact@doguniverse.ma
              </a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-[#F0D98A]/30 mt-12">
        <div className="max-w-3xl mx-auto px-4 py-6 flex gap-4 text-sm text-neutral-500">
          <Link href={`/${locale}`} className="hover:text-charcoal transition-colors">Dog Universe</Link>
          <span>·</span>
          <Link href={`/${locale}/privacy`} className="hover:text-charcoal transition-colors">
            {isFr ? 'Confidentialité' : 'Privacy'}
          </Link>
        </div>
      </footer>
    </div>
  );
}
