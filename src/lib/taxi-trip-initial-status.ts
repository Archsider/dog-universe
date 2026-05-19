// Source unique de vérité pour le status initial d'un nouveau TaxiTrip.
//
// Règle métier : un trajet rattaché à une réservation déjà COMPLETED
// (typiquement une saisie rétroactive walk-in) doit naître directement
// à l'état terminal de son tripType. C'est absurde de créer un trip
// "PLANNED" pour un séjour qui s'est terminé il y a 3 jours.
//
// Pourquoi un module dédié :
//   - 5 sites créent des TaxiTrip (admin patch addon, client booking,
//     status-transitions PENDING→CONFIRMED, walk-in retroactive…). Sans
//     helper partagé, chaque site recopie la logique et drift apparaît.
//   - Tests faciles : pur, zero deps.
//   - Le raccourci UI (PR #169) reste valide en filet de sécurité pour
//     les cas où le status booking change APRÈS création du trip.

export type TaxiTripType = 'OUTBOUND' | 'RETURN' | 'STANDALONE';

/** Status terminal canonique par tripType (mirroir du backend route). */
const TERMINAL_FOR_TYPE: Record<TaxiTripType, string> = {
  OUTBOUND:   'ARRIVED_AT_PENSION',
  STANDALONE: 'ARRIVED_AT_PENSION',
  RETURN:     'ARRIVED_AT_CLIENT',
};

/**
 * Calcule le status initial d'un nouveau TaxiTrip en fonction du status
 * de la réservation parente. Si la résa est COMPLETED, le trip naît
 * terminal — sinon, PLANNED comme avant.
 *
 * @param bookingStatus  Status actuel de la réservation parente
 * @param tripType        OUTBOUND / RETURN / STANDALONE
 * @returns Le status auquel créer le TaxiTrip + l'entrée TaxiStatusHistory
 */
export function initialTaxiTripStatus(
  bookingStatus: string,
  tripType: TaxiTripType,
): string {
  if (bookingStatus === 'COMPLETED') {
    return TERMINAL_FOR_TYPE[tripType];
  }
  return 'PLANNED';
}

/**
 * `true` quand le status retourné par `initialTaxiTripStatus` est terminal —
 * signal pour le caller qu'il faut désactiver le tracking et nullifier le
 * trackingToken comme dans la transition normale vers terminal.
 */
export function isTerminalInitialStatus(
  bookingStatus: string,
): boolean {
  return bookingStatus === 'COMPLETED';
}
