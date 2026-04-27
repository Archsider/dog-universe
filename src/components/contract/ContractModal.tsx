'use client';

import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { CheckCircle, FileText, AlertCircle } from 'lucide-react';

interface ContractModalProps {
  clientName: string;
  onSigned: (downloadUrl: string | null) => void;
}

const CONTRACT_ARTICLES = [
  {
    title: 'PRÉAMBULE',
    content: 'Le présent contrat définit les conditions générales régissant le séjour de l\'animal au sein de l\'établissement DOG UNIVERSE, pension animale située à Marrakech. En signant ce document, le propriétaire de l\'animal (ci-après « le client ») reconnaît avoir pris connaissance de l\'ensemble des dispositions et accepte les obligations réciproques entre lui-même et DOG UNIVERSE (ci-après « la pension »).',
  },
  {
    title: 'Article 1 — Engagement de la pension',
    content: 'DOG UNIVERSE s\'engage à accueillir l\'animal dans des conditions professionnelles garantissant sécurité, hygiène et bien-être. La pension fournit notamment : un espace de repos sécurisé • un accès permanent à l\'eau potable • une surveillance quotidienne • un environnement propre et entretenu • des interactions adaptées.',
  },
  {
    title: 'Article 2 — Conditions sanitaires et vaccinations',
    content: 'Le client certifie que son animal est en bonne santé apparente au moment de l\'admission. Le carnet de santé doit être présenté. Vaccinations obligatoires — Chiens : rage • CHPPI (Carré, hépatite, parvovirose, parainfluenza, leptospirose) — Chats : rage • typhus • coryza. DOG UNIVERSE se réserve le droit de refuser l\'admission d\'un animal présentant : diarrhée • vomissements • toux • lésions suspectes • signes de maladie contagieuse.',
  },
  {
    title: 'Article 3 — État de l\'animal à l\'admission',
    content: 'Un contrôle visuel de l\'animal est réalisé lors de l\'arrivée. Toute anomalie visible pourra être signalée au client. En l\'absence de remarque particulière, l\'animal est considéré comme admis en bon état apparent.',
  },
  {
    title: 'Article 4 — Informations obligatoires du client',
    content: 'Le client s\'engage à communiquer toutes les informations importantes concernant son animal : habitudes alimentaires • allergies • traitements médicaux • comportement • antécédents de morsure • peurs ou particularités comportementales. Toute omission engage la responsabilité du client.',
  },
  {
    title: 'Article 5 — Alimentation et ration quotidienne',
    content: 'Le client doit fournir la nourriture habituelle de son animal pour toute la durée du séjour, ou acheter l\'alimentation directement auprès de DOG UNIVERSE. La nourriture fournie doit être clairement identifiée, en quantité suffisante et accompagnée du grammage quotidien. DOG UNIVERSE peut ajuster les rations selon l\'activité, le stress ou l\'état de l\'animal. En cas de refus d\'alimentation prolongé, DOG UNIVERSE informera le client et pourra consulter un vétérinaire (frais à la charge du client). Si la nourriture est insuffisante, une alimentation équivalente sera fournie et facturée.',
  },
  {
    title: 'Article 6 — Femelles en chaleur',
    content: 'Les femelles en chaleur peuvent être acceptées sous réserve de disponibilité. Un supplément de 30 DH par jour peut être appliqué.',
  },
  {
    title: 'Article 7 — Responsabilité civile du propriétaire',
    content: 'Le client demeure responsable du comportement de son animal. En cas de dommages causés par l\'animal au personnel, à d\'autres animaux ou aux installations, le client s\'engage à assumer l\'ensemble des frais.',
  },
  {
    title: 'Article 8 — Jeux et interactions entre animaux',
    content: 'Les interactions sociales et les jeux font partie du fonctionnement normal d\'une pension. Malgré une surveillance adaptée, il peut survenir des griffures superficielles, morsures de jeu, irritations ou blessures mineures. DOG UNIVERSE ne pourra être tenue responsable sauf en cas de manquement démontré à l\'obligation de surveillance.',
  },
  {
    title: 'Article 9 — Réactions allergiques',
    content: 'Certains animaux peuvent présenter des réactions allergiques liées au stress, à l\'environnement, à l\'alimentation ou à des facteurs externes. DOG UNIVERSE ne pourra être tenue responsable de ces réactions en l\'absence de faute.',
  },
  {
    title: 'Article 10 — Stress et adaptation',
    content: 'Le séjour en pension peut provoquer diarrhée passagère, perte d\'appétit, fatigue ou modification comportementale. Ces réactions liées au changement d\'environnement ne peuvent engager la responsabilité de la pension.',
  },
  {
    title: 'Article 11 — Maladies contagieuses',
    content: 'Certaines maladies peuvent être en incubation avant l\'arrivée de l\'animal, notamment la parvovirose canine, la toux du chenil ou certaines infections parasitaires. DOG UNIVERSE ne pourra être tenue responsable d\'une maladie résultant d\'une incubation antérieure à l\'admission. La vaccination réduit le risque mais ne garantit pas une protection absolue.',
  },
  {
    title: 'Article 12 — Urgences vétérinaires et mandat sanitaire',
    content: 'En cas d\'urgence médicale, DOG UNIVERSE contactera le client. Si celui-ci est injoignable, la pension est autorisée à consulter un vétérinaire. Par la signature du présent contrat, le client donne mandat sanitaire exprès à DOG UNIVERSE pour autoriser toute intervention vétérinaire jugée nécessaire en cas d\'urgence. Le client s\'engage à régler l\'intégralité des frais vétérinaires.',
  },
  {
    title: 'Article 13 — Modalités financières',
    content: 'Paiement : Séjour < 7 jours : paiement intégral — Séjour 7 jours à 1 mois : acompte 30 % — Séjour > 1 mois : acompte 50 %. Modes de paiement : espèces, virement, chèque. Les dates réservées constituent un engagement ferme. En cas de reprise anticipée, l\'intégralité du séjour réservé reste due. Tout jour entamé est dû.',
  },
  {
    title: 'Article 14 — Sécurité sanitaire et obligations antiparasitaires',
    content: 'DOG UNIVERSE applique des protocoles d\'hygiène stricts. Le client doit justifier d\'un traitement antiparasitaire administré dans les 30 jours précédant l\'admission. L\'admission peut être refusée en l\'absence de traitement récent. Si des parasites sont détectés, un traitement curatif sera appliqué avec frais plus forfait de désinfection (150 DH) facturés au client.',
  },
  {
    title: 'Article 15 — Effets personnels',
    content: 'DOG UNIVERSE décline toute responsabilité concernant la perte ou la détérioration d\'objets personnels.',
  },
  {
    title: 'Article 16 — Droit à l\'image',
    content: 'Le client autorise DOG UNIVERSE à utiliser les photos et vidéos de son animal à des fins promotionnelles.',
  },
  {
    title: 'Article 17 — Horaires d\'admission',
    content: 'Horaires d\'admission : Lundi au samedi : 10h00 – 17h00. Toute admission hors horaires pourra être refusée ou facturée.',
  },
  {
    title: 'Article 18 — Non récupération de l\'animal',
    content: 'Le client doit récupérer son animal à la date prévue. Après 10 jours sans nouvelles et après l\'envoi d\'une mise en demeure, l\'animal pourra être considéré comme abandonné. DOG UNIVERSE pourra le confier aux autorités ou à une association.',
  },
  {
    title: 'Article 19 — Limitation de responsabilité',
    content: 'La responsabilité de DOG UNIVERSE est limitée au montant total du séjour facturé, sauf en cas de faute lourde ou intentionnelle.',
  },
  {
    title: 'Article 20 — Réclamations',
    content: 'Toute réclamation doit être formulée par écrit dans un délai de 48 heures après le départ de l\'animal.',
  },
  {
    title: 'Article 21 — Données personnelles',
    content: 'Les données collectées sont nécessaires à la gestion du séjour. Conformément à la loi marocaine 09-08, le client dispose d\'un droit d\'accès, de rectification et de suppression. Les données sont conservées 2 ans.',
  },
  {
    title: 'Article 22 — Litiges',
    content: 'Les parties rechercheront une solution amiable. À défaut, les tribunaux compétents seront ceux de Marrakech.',
  },
  {
    title: 'Article 23 — Intégralité du contrat',
    content: 'Le présent contrat constitue l\'intégralité de l\'accord entre les parties. Toute modification doit être faite par écrit.',
  },
];

export function ContractModal({ clientName, onSigned }: ContractModalProps) {
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!signature || !accepted) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl: signature }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Erreur lors de la signature');
      }

      setSuccess(true);
      setTimeout(() => {
        onSigned(data.downloadUrl);
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 shadow-2xl">
          <CheckCircle className="text-green-500 w-16 h-16" />
          <p className="text-lg font-semibold text-gray-800">Contrat signé avec succès !</p>
          <p className="text-sm text-gray-500">Bienvenue chez DOG UNIVERSE 🐾</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-100 flex-shrink-0">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Contrat de pension — DOG UNIVERSE</h2>
            <p className="text-xs text-gray-500">Veuillez lire et signer avant d&apos;accéder à votre espace</p>
          </div>
        </div>

        {/* Contract text (scrollable) */}
        <div className="overflow-y-auto flex-1 px-6 py-4 text-sm text-gray-700 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-amber-800 font-medium text-xs uppercase tracking-wide mb-1">Conditions Générales de Pension</p>
            <p className="text-amber-700 text-xs">DOG UNIVERSE SARLAU — RC : 87023 — IF : 25081867 — ICE : 002035800000002</p>
            <p className="text-amber-700 text-xs">Dr el Caid Souihla Saada, Marrakech, Maroc</p>
          </div>

          {CONTRACT_ARTICLES.map((article, idx) => (
            <div key={idx}>
              <p className="font-semibold text-gray-900 text-xs mb-1">{article.title}</p>
              <p className="text-gray-600 text-xs leading-relaxed">{article.content}</p>
            </div>
          ))}
        </div>

        {/* Signature section */}
        <div className="px-6 py-4 border-t border-amber-100 flex-shrink-0 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Votre signature <span className="text-red-500">*</span>
            </p>
            <SignaturePad
              onSigned={(url) => setSignature(url)}
              onCleared={() => setSignature(null)}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs text-gray-600">
              Je, <strong>{clientName}</strong>, confirme avoir lu et accepté l&apos;intégralité des conditions générales ci-dessus.
              Cette signature électronique a valeur contractuelle.
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!signature || !accepted || loading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all
              bg-gradient-to-r from-[#C9A84C] to-[#E4C06A] text-white shadow-sm
              hover:shadow-md hover:opacity-90
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Signature en cours...' : 'Signer le contrat et accéder à mon espace'}
          </button>
        </div>
      </div>
    </div>
  );
}
