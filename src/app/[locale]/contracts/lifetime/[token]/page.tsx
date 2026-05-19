// Public page reached via the magic link sent to the owner of a permanent-
// resident pet. No auth required — the HMAC token in the URL is the auth.
//
// PENDING + valid token → renders the contract terms + signature pad +
// submit button (LifetimeSignClient).
// SIGNED → shows the "already signed" confirmation + download button.
// REVOKED / EXPIRED / invalid → graceful error page.

import { prisma } from '@/lib/prisma';
import { verifyLifetimeToken } from '@/lib/lifetime-contracts';
import { LifetimeSignClient } from './LifetimeSignClient';

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

// Same 10 articles as the PDF generator — kept verbatim so what the owner
// reads on screen matches the document they sign.  Should we update the
// terms, update both this constant and `LIFETIME_ARTICLES` in
// `src/lib/contract-pdf-lifetime.tsx` together.
const ARTICLES = [
  {
    title: 'PRÉAMBULE',
    text: `Le présent contrat définit les conditions particulières régissant l'accueil à vie de l'animal désigné ci-dessous au sein de l'établissement DOG UNIVERSE, pension animale située à Marrakech. Il complète et déroge, en tant que de besoin, aux conditions générales de pension habituellement applicables.`,
  },
  {
    title: 'Article 1 — Engagement de pension à vie',
    text: `DOG UNIVERSE s'engage à accueillir l'animal en pension permanente pour le restant de sa vie naturelle, dans des conditions professionnelles garantissant sécurité, hygiène, bien-être et qualité de soins équivalents à ceux des autres pensionnaires. Le propriétaire confirme transférer la garde matérielle quotidienne tout en demeurant juridiquement propriétaire de l'animal.`,
  },
  {
    title: 'Article 2 — Statut de résident permanent',
    text: `L'animal est identifié dans le système de DOG UNIVERSE comme « résident permanent ». À ce titre, il n'est pas comptabilisé comme un séjour temporaire et bénéficie d'un suivi adapté à une présence longue durée.`,
  },
  {
    title: 'Article 3 — Frais de pension et soins',
    text: `Le propriétaire s'engage à régler l'intégralité des frais liés à la prise en charge de l'animal : pension mensuelle, alimentation, soins vétérinaires, traitements anti-parasitaires, toilettage, vaccinations et tout autre frais nécessaire au bien-être de l'animal. DOG UNIVERSE administre ces dépenses pour le compte du propriétaire à partir d'un budget mensuel provisionné par celui-ci.`,
  },
  {
    title: 'Article 4 — Provisions et facturation',
    text: `Le propriétaire alimente régulièrement un budget destiné à couvrir les frais courants. DOG UNIVERSE tient une comptabilité distincte pour l'animal et informe le propriétaire lorsque le solde nécessite d'être réapprovisionné. En cas de soins urgents dépassant le solde disponible, DOG UNIVERSE engage les frais dans l'intérêt de l'animal et en informe le propriétaire sans délai.`,
  },
  {
    title: 'Article 5 — Mandat sanitaire',
    text: `Le propriétaire donne mandat exprès à DOG UNIVERSE pour autoriser tout acte vétérinaire jugé nécessaire en cas d'urgence (consultation, traitement, hospitalisation, intervention chirurgicale) lorsque celui-ci ne peut être joint dans un délai raisonnable. DOG UNIVERSE fait toujours appel à un vétérinaire agréé et conserve les justificatifs.`,
  },
  {
    title: 'Article 6 — Visites du propriétaire',
    text: `Le propriétaire peut rendre visite à l'animal sur rendez-vous, dans le respect des horaires d'ouverture et de la tranquillité de la pension.`,
  },
  {
    title: 'Article 7 — Fin de prise en charge',
    text: `Le présent contrat peut prendre fin par le décès naturel de l'animal, par la reprise de l'animal par son propriétaire moyennant un préavis raisonnable, ou par la décision motivée de DOG UNIVERSE en cas de manquements répétés du propriétaire après mise en demeure.`,
  },
  {
    title: 'Article 8 — Responsabilité',
    text: `DOG UNIVERSE met en œuvre tous les moyens raisonnables pour assurer la sécurité et le bien-être de l'animal. La responsabilité de la pension ne peut être engagée en cas de force majeure, de maladie préexistante non déclarée, ou d'accident survenu malgré les précautions prises.`,
  },
  {
    title: 'Article 9 — Données personnelles & litiges',
    text: `Les informations personnelles du propriétaire et les données de santé de l'animal sont traitées dans le strict cadre de l'exécution du présent contrat (loi marocaine n° 09-08). Les parties s'efforceront de régler à l'amiable tout différend ; à défaut, les tribunaux compétents seront ceux de Marrakech.`,
  },
];

function ErrorPage({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <main className="min-h-screen bg-ivory-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center border border-[#F0D98A]/40">
        <p className="text-5xl mb-3" aria-hidden="true">{icon}</p>
        <h1 className="text-xl font-bold text-charcoal mb-2">{title}</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </main>
  );
}

export default async function LifetimeContractSignPage({ params }: PageProps) {
  const { token } = await params;

  const contractId = verifyLifetimeToken(token);
  if (!contractId) {
    return (
      <ErrorPage
        icon="🔒"
        title="Lien invalide"
        message="Ce lien n'est pas valide. Si vous l'avez reçu de Dog Universe, contactez-nous."
      />
    );
  }

  const contract = await prisma.lifetimeContract.findUnique({
    where: { id: contractId },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      pet: {
        select: {
          name: true,
          gender: true,
          breed: true,
          isNeutered: true,
          microchipNumber: true,
          notes: true,
        },
      },
    },
  });

  if (!contract || contract.publicToken !== token) {
    return (
      <ErrorPage
        icon="❓"
        title="Contrat introuvable"
        message="Ce contrat n'existe pas ou a été annulé par Dog Universe."
      />
    );
  }
  if (contract.status === 'REVOKED') {
    return (
      <ErrorPage
        icon="🚫"
        title="Lien annulé"
        message="Ce lien a été annulé par Dog Universe. Contactez-nous pour obtenir un nouveau lien."
      />
    );
  }
  const expired =
    contract.status === 'EXPIRED' ||
    (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date());

  if (expired) {
    return (
      <ErrorPage
        icon="⏳"
        title="Lien expiré"
        message="Ce lien a expiré. Demandez un nouveau lien à Dog Universe."
      />
    );
  }

  const dogDescriptionParts: string[] = [];
  if (contract.pet.breed) dogDescriptionParts.push(contract.pet.breed);
  if (contract.pet.gender === 'FEMALE') dogDescriptionParts.push('femelle');
  else if (contract.pet.gender === 'MALE') dogDescriptionParts.push('mâle');
  if (contract.pet.isNeutered === true) dogDescriptionParts.push('stérilisée');
  if (contract.pet.microchipNumber) {
    dogDescriptionParts.push(`identifiée (puce ${contract.pet.microchipNumber})`);
  } else {
    dogDescriptionParts.push('identifiée par puce électronique');
  }
  if (contract.pet.notes && contract.pet.notes.trim().length > 0) {
    dogDescriptionParts.push(contract.pet.notes.trim().replace(/\s+/g, ' '));
  }
  const dogDescription = dogDescriptionParts.join(', ');

  return (
    <main className="min-h-screen bg-ivory-50 py-8 px-4">
      <LifetimeSignClient
        token={token}
        alreadySigned={contract.status === 'SIGNED'}
        signedAt={contract.signedAt ? contract.signedAt.toISOString() : null}
        clientName={contract.client.name ?? 'Propriétaire'}
        dogName={contract.pet.name}
        dogDescription={dogDescription}
        dogGender={contract.pet.gender === 'FEMALE' ? 'Femelle' : contract.pet.gender === 'MALE' ? 'Mâle' : 'Non précisé'}
        articles={ARTICLES}
      />
    </main>
  );
}
