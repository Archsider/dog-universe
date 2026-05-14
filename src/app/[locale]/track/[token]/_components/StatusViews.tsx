// Pre-OK status views — rendered before any GPS data has arrived.
// All four states share the same centred branded layout.

interface Props {
  isFr: boolean;
}

const FRAME =
  'min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6';

export function LoadingView({ isFr }: Props) {
  return (
    <div className={`${FRAME} text-[#8A7E75]`}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">{isFr ? 'Chargement…' : 'Loading…'}</p>
      </div>
    </div>
  );
}

export function NotFoundView({ isFr }: Props) {
  return (
    <div className={FRAME}>
      <div className="text-center max-w-sm">
        <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
        <p className="text-[#8A7E75]">
          {isFr ? 'Lien invalide ou expiré.' : 'Invalid or expired link.'}
        </p>
      </div>
    </div>
  );
}

export function InactiveView({ isFr }: Props) {
  return (
    <div className={FRAME}>
      <div className="text-center max-w-sm">
        <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
        <p className="text-[#8A7E75] text-sm leading-relaxed">
          {isFr
            ? "Le suivi GPS n'est pas actif pour cette course."
            : 'GPS tracking is not active for this trip.'}
        </p>
      </div>
    </div>
  );
}

export function ErrorView({ isFr }: Props) {
  return (
    <div className={FRAME}>
      <div className="text-center max-w-sm">
        <p className="text-[#8A7E75] text-sm">
          {isFr
            ? 'Erreur réseau — nouvelle tentative dans quelques secondes…'
            : 'Network error — retrying in a few seconds…'}
        </p>
      </div>
    </div>
  );
}

interface WaitingProps {
  isFr: boolean;
}

/**
 * Inline waiting state — rendered inside the layout (header still shown)
 * when the trip is active but no fix has arrived yet. This is NOT a full
 * page replacement.
 */
export function WaitingForFix({ isFr }: WaitingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-4">
      <div className="inline-block w-10 h-10 border-[3px] border-[#C4974A] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#7A6E65] text-sm">
        {isFr ? 'En attente de la position GPS…' : 'Waiting for GPS position…'}
      </p>
      <p className="text-[#8A7E75] text-xs">
        {isFr
          ? 'Le chauffeur active le suivi sur son téléphone.'
          : 'Driver is enabling tracking on their phone.'}
      </p>
    </div>
  );
}
