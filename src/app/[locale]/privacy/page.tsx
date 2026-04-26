import type { Metadata } from 'next';
import Link from 'next/link';

type Params = { locale: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
  const isFr = locale === 'fr';
  return {
    title: isFr ? 'Politique de confidentialité — Dog Universe' : 'Privacy Policy — Dog Universe',
    description: isFr
      ? 'Comment Dog Universe collecte, utilise et protège vos données personnelles.'
      : 'How Dog Universe collects, uses and protects your personal data.',
    alternates: { canonical: `${baseUrl}/${locale}/privacy` },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<Params> }) {
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
          {isFr ? 'Politique de confidentialité' : 'Privacy Policy'}
        </h1>
        <p className="text-sm text-neutral-500 mb-10">
          {isFr ? 'Dernière mise à jour : avril 2026' : 'Last updated: April 2026'}
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-charcoal/80 leading-relaxed">

          {/* 1 — Responsable du traitement */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '1. Responsable du traitement' : '1. Data Controller'}
            </h2>
            {isFr ? (
              <p>
                Dog Universe est une entreprise basée à Marrakech, Maroc. Elle est responsable du traitement
                de vos données personnelles collectées via la présente plateforme. Pour toute question relative
                à vos données, contactez-nous à :{' '}
                <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                  contact@doguniverse.ma
                </a>
              </p>
            ) : (
              <p>
                Dog Universe is a company based in Marrakech, Morocco, and is the data controller for
                personal data collected through this platform. For any questions regarding your data,
                contact us at:{' '}
                <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                  contact@doguniverse.ma
                </a>
              </p>
            )}
          </section>

          {/* 2 — Données collectées */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '2. Données collectées' : '2. Data We Collect'}
            </h2>
            {isFr ? (
              <>
                <p className="mb-3">Nous collectons les données suivantes :</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Informations de compte :</strong> nom, adresse email, numéro de téléphone, mot de passe (haché), langue préférée.</li>
                  <li><strong>Informations sur vos animaux :</strong> nom, espèce, race, date de naissance, poids, photos, documents de vaccination, antécédents médicaux renseignés.</li>
                  <li><strong>Réservations :</strong> type de service, dates, statut, prix, notes spéciales.</li>
                  <li><strong>Contrat client :</strong> signature numérique manuscrite, adresse IP, horodatage, version du contrat signé.</li>
                  <li><strong>Communications :</strong> messages échangés avec notre équipe via la plateforme.</li>
                  <li><strong>Photos de séjour :</strong> photos de votre animal prises pendant son séjour, partagées avec vous via la plateforme.</li>
                  <li><strong>Données techniques :</strong> adresses IP (pour la protection contre les abus, non conservées de façon permanente).</li>
                </ul>
              </>
            ) : (
              <>
                <p className="mb-3">We collect the following data:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Account information:</strong> name, email address, phone number, password (hashed), preferred language.</li>
                  <li><strong>Pet information:</strong> name, species, breed, date of birth, weight, photos, vaccination documents, declared medical history.</li>
                  <li><strong>Bookings:</strong> service type, dates, status, price, special notes.</li>
                  <li><strong>Client contract:</strong> handwritten digital signature, IP address, timestamp, version of the signed contract.</li>
                  <li><strong>Communications:</strong> messages exchanged with our team through the platform.</li>
                  <li><strong>Stay photos:</strong> photos of your pet taken during their stay, shared with you via the platform.</li>
                  <li><strong>Technical data:</strong> IP addresses (for abuse protection, not permanently stored).</li>
                </ul>
              </>
            )}
          </section>

          {/* 3 — Finalités */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '3. Finalités du traitement' : '3. How We Use Your Data'}
            </h2>
            {isFr ? (
              <ul className="list-disc pl-5 space-y-2">
                <li>Gestion de votre compte et fourniture des services (pension, pet taxi).</li>
                <li>Confirmation et suivi de vos réservations par email et notifications.</li>
                <li>Génération de factures et contrats.</li>
                <li>Programme de fidélité (calcul du grade, avantages).</li>
                <li>Rappels de séjour et notifications d&apos;anniversaire de vos animaux.</li>
                <li>Communication interne avec notre équipe.</li>
                <li>Protection de la plateforme contre les abus et fraudes.</li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-2">
                <li>Managing your account and providing services (boarding, pet taxi).</li>
                <li>Confirming and tracking your bookings via email and in-app notifications.</li>
                <li>Generating invoices and contracts.</li>
                <li>Loyalty programme (grade calculation, benefits).</li>
                <li>Stay reminders and pet birthday notifications.</li>
                <li>Internal communication with our team.</li>
                <li>Protecting the platform against abuse and fraud.</li>
              </ul>
            )}
          </section>

          {/* 4 — Sous-traitants */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '4. Sous-traitants et transferts' : '4. Sub-processors & Transfers'}
            </h2>
            {isFr ? (
              <>
                <p className="mb-3">
                  Vos données sont hébergées et traitées par les prestataires suivants, dans le cadre de leurs
                  propres politiques de confidentialité et clauses contractuelles types :
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Supabase</strong> (États-Unis) — base de données PostgreSQL et stockage des fichiers (photos, documents).</li>
                  <li><strong>Vercel</strong> (États-Unis) — hébergement et déploiement de l&apos;application.</li>
                  <li><strong>Upstash</strong> (États-Unis) — protection contre les abus par limitation du taux de requêtes (adresses IP, non persistées).</li>
                  <li><strong>Prestataire SMTP</strong> — envoi d&apos;emails transactionnels.</li>
                </ul>
                <p className="mt-3">
                  Vos données ne sont jamais vendues ni cédées à des tiers à des fins commerciales.
                </p>
              </>
            ) : (
              <>
                <p className="mb-3">
                  Your data is hosted and processed by the following providers, subject to their own privacy
                  policies and standard contractual clauses:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Supabase</strong> (United States) — PostgreSQL database and file storage (photos, documents).</li>
                  <li><strong>Vercel</strong> (United States) — application hosting and deployment.</li>
                  <li><strong>Upstash</strong> (United States) — abuse protection via rate limiting (IP addresses, not persisted).</li>
                  <li><strong>SMTP provider</strong> — transactional email delivery.</li>
                </ul>
                <p className="mt-3">
                  Your data is never sold or transferred to third parties for commercial purposes.
                </p>
              </>
            )}
          </section>

          {/* 5 — Conservation */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '5. Durée de conservation' : '5. Data Retention'}
            </h2>
            {isFr ? (
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Données de compte :</strong> conservées jusqu&apos;à la suppression du compte ou sur demande.</li>
                <li><strong>Réservations et factures :</strong> 5 ans à compter de la date de service (obligation légale commerciale).</li>
                <li><strong>Contrats signés :</strong> 5 ans à compter de la signature.</li>
                <li><strong>Photos de séjour :</strong> conservées jusqu&apos;à suppression par l&apos;administrateur ou sur demande.</li>
                <li><strong>Documents médicaux :</strong> conservés tant que l&apos;animal est enregistré sur la plateforme.</li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Account data:</strong> retained until account deletion or upon request.</li>
                <li><strong>Bookings and invoices:</strong> 5 years from the service date (commercial legal obligation).</li>
                <li><strong>Signed contracts:</strong> 5 years from the date of signature.</li>
                <li><strong>Stay photos:</strong> retained until deleted by an administrator or upon request.</li>
                <li><strong>Medical documents:</strong> retained while the pet is registered on the platform.</li>
              </ul>
            )}
          </section>

          {/* 6 — Droits */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '6. Vos droits' : '6. Your Rights'}
            </h2>
            {isFr ? (
              <>
                <p className="mb-3">
                  Conformément à la loi marocaine n° 09-08 relative à la protection des personnes physiques
                  à l&apos;égard du traitement des données à caractère personnel, vous disposez des droits suivants :
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Droit d&apos;accès :</strong> obtenir une copie de vos données.</li>
                  <li><strong>Droit de rectification :</strong> corriger des données inexactes.</li>
                  <li><strong>Droit d&apos;effacement :</strong> demander la suppression de vos données (sous réserve des obligations légales de conservation).</li>
                  <li><strong>Droit d&apos;opposition :</strong> vous opposer à certains traitements.</li>
                </ul>
                <p className="mt-3">
                  Pour exercer ces droits, contactez-nous à{' '}
                  <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                    contact@doguniverse.ma
                  </a>
                  . Nous répondrons dans un délai de 30 jours.
                </p>
              </>
            ) : (
              <>
                <p className="mb-3">
                  Under Moroccan Law No. 09-08 on the protection of personal data, you have the following rights:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Right of access:</strong> obtain a copy of your data.</li>
                  <li><strong>Right of rectification:</strong> correct inaccurate data.</li>
                  <li><strong>Right of erasure:</strong> request deletion of your data (subject to legal retention obligations).</li>
                  <li><strong>Right to object:</strong> object to certain processing activities.</li>
                </ul>
                <p className="mt-3">
                  To exercise these rights, contact us at{' '}
                  <a href="mailto:contact@doguniverse.ma" className="text-gold-700 hover:underline">
                    contact@doguniverse.ma
                  </a>
                  . We will respond within 30 days.
                </p>
              </>
            )}
          </section>

          {/* 7 — Sécurité */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '7. Sécurité' : '7. Security'}
            </h2>
            {isFr ? (
              <p>
                Nous mettons en œuvre des mesures techniques adaptées pour protéger vos données : chiffrement
                des communications (HTTPS/TLS), hachage des mots de passe, stockage des documents sensibles
                dans des espaces privés non accessibles publiquement, protection contre les abus par limitation
                des requêtes. Aucun système n&apos;étant infaillible, nous vous invitons à nous contacter
                immédiatement en cas de suspicion de compromission.
              </p>
            ) : (
              <p>
                We implement appropriate technical measures to protect your data: encrypted communications
                (HTTPS/TLS), password hashing, sensitive document storage in private non-publicly accessible
                storage, and abuse protection via rate limiting. No system is infallible; please contact us
                immediately if you suspect a security issue.
              </p>
            )}
          </section>

          {/* 8 — Cookies */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '8. Cookies' : '8. Cookies'}
            </h2>
            {isFr ? (
              <p>
                Nous utilisons uniquement un cookie de session sécurisé (HttpOnly) nécessaire au
                fonctionnement de l&apos;authentification. Aucun cookie publicitaire ou analytique tiers
                n&apos;est déposé sur votre appareil.
              </p>
            ) : (
              <p>
                We use only a secure HttpOnly session cookie required for authentication. No third-party
                advertising or analytics cookies are placed on your device.
              </p>
            )}
          </section>

          {/* 9 — Contact */}
          <section>
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">
              {isFr ? '9. Contact' : '9. Contact'}
            </h2>
            <p>
              {isFr
                ? 'Pour toute question relative à cette politique ou à vos données personnelles :'
                : 'For any questions regarding this policy or your personal data:'}
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
          <Link href={`/${locale}/terms`} className="hover:text-charcoal transition-colors">
            {isFr ? 'CGU' : 'Terms'}
          </Link>
        </div>
      </footer>
    </div>
  );
}
