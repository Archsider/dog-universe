'use client';

import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { CheckCircle, FileText, AlertCircle } from 'lucide-react';

interface ContractModalProps {
  clientName: string;
  onSigned: (pdfUrl: string) => void;
}

const CONTRACT_ARTICLES = [
  {
    title: 'Article 1 — Engagement de la pension',
    content: 'DOG UNIVERSE s\'engage à accueillir votre animal dans les meilleures conditions possibles, en lui fournissant les soins nécessaires, une alimentation adaptée et un environnement sécurisé.',
  },
  {
    title: 'Article 2 — Santé, vaccinations et antiparasitaire',
    content: 'Tous les animaux accueillis doivent être en bonne santé apparente. Les vaccinations obligatoires doivent être à jour. Un traitement antiparasitaire doit avoir été administré dans les 30 jours précédant le séjour.',
  },
  {
    title: 'Article 3 — Alimentation',
    content: 'La pension fournit une alimentation de qualité adaptée. Le client peut fournir la nourriture habituelle de son animal. Les régimes spéciaux doivent être signalés à l\'admission.',
  },
  {
    title: 'Article 4 — Informations obligatoires',
    content: 'Le client s\'engage à fournir toutes les informations nécessaires : habitudes, comportements particuliers, traitements en cours, et tout antécédent de morsure ou d\'agressivité.',
  },
  {
    title: 'Article 5 — Femelles en chaleur',
    content: 'Les femelles en chaleur sont acceptées sous réserve de disponibilité. Un supplément de 30 DH/jour sera appliqué. Le client doit en informer la pension à la réservation.',
  },
  {
    title: 'Article 6 — Urgences médicales',
    content: 'En cas d\'urgence, la pension contactera immédiatement le client. Si injoignable, un vétérinaire d\'urgence sera appelé. Les frais vétérinaires sont à la charge du client.',
  },
  {
    title: 'Article 7 — Modalités financières',
    content: 'Pour les séjours supérieurs à un mois, un acompte de 50% est exigé. Le jour de départ est comptabilisé. Le solde est dû au départ de l\'animal.',
  },
  {
    title: 'Article 8 — Annulation et départ anticipé',
    content: 'Toute annulation moins de 72h avant le dépôt ou tout départ anticipé entraîne la facturation de 50% du séjour prévu.',
  },
  {
    title: 'Article 9 — Hygiène et responsabilité',
    content: 'Tout animal présentant une parasitose sera traité aux frais du client. La pension décline toute responsabilité en cas d\'accident entre animaux ou comportement imprévisible.',
  },
  {
    title: 'Article 10 — Effets personnels',
    content: 'La pension ne saurait être tenue responsable de la perte ou dégradation d\'effets personnels apportés par le client.',
  },
  {
    title: 'Article 11 — Droit à l\'image',
    content: 'Le client autorise la pension à photographier son animal et à utiliser ces photos à des fins promotionnelles. Refus possible en le signalant à l\'admission.',
  },
  {
    title: 'Article 12 — Refus d\'admission',
    content: 'La pension se réserve le droit de refuser tout animal présentant un danger, des vaccinations insuffisantes, ou nécessitant des soins vétérinaires immédiats.',
  },
  {
    title: 'Article 13 — Réserves et réclamations',
    content: 'Toute réclamation doit être formulée dans les 48 heures suivant le départ de l\'animal. Passé ce délai, aucune réclamation ne pourra être prise en compte.',
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
        onSigned(data.pdfUrl);
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
            <p className="text-xs text-gray-500">Veuillez lire et signer avant d'accéder à votre espace</p>
          </div>
        </div>

        {/* Contract text (scrollable) */}
        <div className="overflow-y-auto flex-1 px-6 py-4 text-sm text-gray-700 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-amber-800 font-medium text-xs uppercase tracking-wide mb-1">Conditions Générales de Pension</p>
            <p className="text-amber-700 text-xs">DOG UNIVERSE SARLAU — RC 87023 — ICE 002035800000002</p>
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
              Je, <strong>{clientName}</strong>, confirme avoir lu et accepté l'intégralité des conditions générales ci-dessus.
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
