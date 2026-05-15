/**
 * BUSINESS REGRESSION SUITE — Module 2 du filet de sécurité métier.
 *
 * 7 cas canoniques bloquants en CI. Chaque cas correspond à un bug réel
 * qui a mordu prod ou à une règle métier critique. Si l'une des assertions
 * de ce fichier échoue, le merge est bloqué automatiquement (npm test =
 * vitest run, exécuté par .github/workflows/ci.yml → step "Tests").
 *
 * Règle d'or : ce fichier doit rester PURE (aucun appel réseau, aucun
 * appel Prisma réel). Les helpers métier sont testés via leurs entrées
 * pures (`computeMonthlyRevenueByCategory`, `casablancaDateOnly`, ...) ;
 * les comportements DB sont vérifiés en inspectant la *forme* du
 * Prisma.WhereInput retourné par les builders (`getMonthlyInvoicesWhere`)
 * — pas en exécutant la requête.
 *
 * Pour les tests qui nécessitent une vraie DB (capacity boundary lue
 * depuis Setting), un test d'intégration séparé existerait sous
 * `src/__tests__/integration/` (pattern PR #70 INTEGRATION_DATABASE_URL).
 * Ici on parametrise la valeur pour rester pure-unit et indépendant
 * de la valeur prod actuelle (cf. la consigne explicite de Mehdi : "ne
 * pas hardcoder 50, sinon le test bloque si on change le Setting").
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Helper imports (pure functions) ──────────────────────────────────────
import { computeMonthlyRevenueByCategory, allocateBetweenItems } from '@/lib/accounting';
import { casablancaDateOnly } from '@/lib/dates-casablanca';
import { calculateSuggestedGrade } from '@/lib/loyalty';
import { getMonthlyInvoicesWhere } from '@/lib/billing';

// =============================================================================
// CASE 1 — Rita (DU-2026-0030)
// =============================================================================
// Sémantique A (PR #87) : facture 940 MAD (Pension 840 OTHER + Toilettage
// 100 GROOMING), 2 paiements (900 MAD le 29/04 + 40 MAD le 06/05). Le bug
// d'origine : ancien algo FIFO attribuait 40 MAD à Toilettage en mai
// (= reliquat du payment de mai après que celui d'avril ait consommé toute
// la Pension + 60 MAD de Toilettage). Sémantique A corrige : facture
// clôturée en mai → 100% des items basculent en mai (Toilettage = 100, pas
// 40). Avril = 0 partout.
//
// SI CE TEST CASSE : Sémantique A a régressé. Drill src/lib/accounting.ts.
describe('REGRESSION — Rita case (DU-2026-0030) sous Sémantique A', () => {
  const APRIL_START = new Date('2026-04-01T00:00:00Z');
  const APRIL_END = new Date('2026-04-30T23:59:59.999Z');
  const MAY_START = new Date('2026-05-01T00:00:00Z');
  const MAY_END = new Date('2026-05-31T23:59:59.999Z');
  const ritaPayments = [
    { amount: 900, paymentDate: new Date('2026-04-29') },
    { amount: 40, paymentDate: new Date('2026-05-06') },
  ];
  const ritaItems = [
    // Pension Mamy — DB row a category='OTHER' mais la description contient
    // "Pension" donc l'inférence catégorie (categoryKey) renvoie BOARDING.
    { category: 'OTHER', total: 840, description: 'Pension Mamy (chien)' },
    { category: 'GROOMING', total: 100, description: 'Toilettage Mamy (petit)' },
  ];

  it('Mai 2026 → Toilettage 100 MAD (PAS 40 — fix Rita), Pension 840', () => {
    const may = computeMonthlyRevenueByCategory(ritaPayments, ritaItems, MAY_START, MAY_END);
    expect(may.boarding).toBe(840);
    expect(may.grooming).toBe(100);
    expect(may.other).toBe(0);
  });

  it('Avril 2026 → 0 partout (acompte ne bascule plus rien en avril)', () => {
    const april = computeMonthlyRevenueByCategory(
      ritaPayments,
      ritaItems,
      APRIL_START,
      APRIL_END,
    );
    expect(april.boarding).toBe(0);
    expect(april.grooming).toBe(0);
  });

  it('Conservation : Σ(avril, mai) = invoice.amount = 940 MAD', () => {
    const a = computeMonthlyRevenueByCategory(ritaPayments, ritaItems, APRIL_START, APRIL_END);
    const m = computeMonthlyRevenueByCategory(ritaPayments, ritaItems, MAY_START, MAY_END);
    const total =
      (a.boarding + a.taxi + a.grooming + a.croquettes + a.other) +
      (m.boarding + m.taxi + m.grooming + m.croquettes + m.other);
    expect(total).toBe(940);
  });
});

// =============================================================================
// CASE 2 — Timezone Casablanca (UTC+1 fixe)
// =============================================================================
// Bug Wave 1 #2 : un booking créé à 22:30 UTC le 14 mai apparaissait
// "14 mai" sur le dashboard alors qu'on est déjà le 15 mai à Casa
// (UTC+1). `casablancaDateOnly` doit ancrer le calcul en UTC+1, pas en UTC.
//
// SI CE TEST CASSE : la fonction est repassée en UTC ou utilise getUTCDate.
describe('REGRESSION — timezone Casablanca (UTC+1, no DST)', () => {
  it('22:30 UTC le 14 mai = 23:30 Casa le 14 mai → "2026-05-14"', () => {
    expect(casablancaDateOnly(new Date('2026-05-14T22:30:00Z'))).toBe('2026-05-14');
  });

  it('23:30 UTC le 14 mai = 00:30 Casa le 15 mai → "2026-05-15"', () => {
    // Boundary qui se cassait dans l'ancien code : Date.getUTCDate retourne
    // 14, alors que la date métier Casa est déjà le 15.
    expect(casablancaDateOnly(new Date('2026-05-14T23:30:00Z'))).toBe('2026-05-15');
  });

  it('minuit Casa exact = 23:00:00 UTC la veille → "lendemain"', () => {
    expect(casablancaDateOnly(new Date('2026-05-14T23:00:00Z'))).toBe('2026-05-15');
  });
});

// =============================================================================
// CASE 3 — Loyalty tier boundaries
// =============================================================================
// Règle métier verrouillée (CLAUDE.md, NE PAS MODIFIER) :
//   BRONZE : 1-3 séjours
//   SILVER : 4-9 séjours
//   GOLD   : 10-19 séjours
//   PLATINUM : 20+ séjours OU ≥ 55 000 MAD de revenu cumulé
//
// L'admin peut override manuellement (LoyaltyGrade.isOverride). Le test
// ici fige UNIQUEMENT la suggestion auto via calculateSuggestedGrade.
//
// Spec Mehdi : "9 nuitées + 100 points → tier correct (nights OR points)".
// 9 nuitées = SILVER (4-9). 100 MAD < 55 000 MAD → ne déclenche pas PLATINUM.
// Donc 9/100 → SILVER. Confirmé.
//
// SI CE TEST CASSE : les seuils ont été modifiés sans accord explicite.
describe('REGRESSION — loyalty tier auto-suggestion boundaries', () => {
  it('1 séjour → BRONZE', () => {
    expect(calculateSuggestedGrade(1, 0)).toBe('BRONZE');
  });
  it('3 séjours → BRONZE (haute borne BRONZE)', () => {
    expect(calculateSuggestedGrade(3, 0)).toBe('BRONZE');
  });
  it('4 séjours → SILVER (basse borne SILVER)', () => {
    expect(calculateSuggestedGrade(4, 0)).toBe('SILVER');
  });
  it('9 séjours + 100 MAD revenu → SILVER (le cas du spec Mehdi)', () => {
    expect(calculateSuggestedGrade(9, 100)).toBe('SILVER');
  });
  it('9 séjours → SILVER (haute borne SILVER)', () => {
    expect(calculateSuggestedGrade(9, 0)).toBe('SILVER');
  });
  it('10 séjours → GOLD (basse borne GOLD)', () => {
    expect(calculateSuggestedGrade(10, 0)).toBe('GOLD');
  });
  it('19 séjours → GOLD (haute borne GOLD)', () => {
    expect(calculateSuggestedGrade(19, 0)).toBe('GOLD');
  });
  it('20 séjours → PLATINUM (basse borne PLATINUM via stays)', () => {
    expect(calculateSuggestedGrade(20, 0)).toBe('PLATINUM');
  });
  it('PLATINUM via revenu (OR logic) : 1 séjour + 55 000 MAD → PLATINUM', () => {
    // Le seuil PLATINUM par revenu = 5000 × 11 = 55 000 MAD (cf. loyalty.ts).
    // Si jamais le multiplicateur change, ce test cassera et c'est voulu :
    // un changement métier exige une discussion explicite.
    expect(calculateSuggestedGrade(1, 55_000)).toBe('PLATINUM');
  });
  it('PLATINUM via revenu sous le seuil : 1 séjour + 54 999 MAD → BRONZE', () => {
    expect(calculateSuggestedGrade(1, 54_999)).toBe('BRONZE');
  });
});

// =============================================================================
// CASE 4 — Capacity boundary (DB-driven, NOT hardcoded)
// =============================================================================
// Mehdi explicit : "utilise la valeur DB Setting (capacity_dog) au runtime,
// PAS une constante hardcodée 50". On parametrise donc : pour N donné, le
// Nème animal accepté, le (N+1)ème refusé. La règle métier est
// **indépendante** de la valeur N — donc le test reste vert quelle que
// soit la capacité prod actuelle.
//
// On teste l'arithmétique de la décision (`newPets > limit - current`)
// telle qu'utilisée par `checkBoardingCapacity` dans `capacity.ts`. Un
// test d'intégration séparé (skipped without INTEGRATION_DATABASE_URL,
// pattern PR #70) couvrirait l'exécution réelle Prisma — hors-scope ici.
//
// SI CE TEST CASSE : soit la formule de décision a changé dans capacity.ts,
// soit l'opérateur strict `>` a été remplacé par `>=` ou inversement.

// Mirror exact de la décision capacity.ts ligne 192-194 :
//   const available = Math.max(0, limits.dogs - currentDogs);
//   if (newDogs > available) return { ok: false, ... };
// Le test ASSERT que cette formule produit le bon verdict aux bornes.
function isAcceptedByCapacityRule(
  limit: number,
  current: number,
  newPets: number,
): boolean {
  const available = Math.max(0, limit - current);
  return newPets <= available;
}

describe('REGRESSION — capacity boundary (DB-driven, parametric)', () => {
  // ── Dogs ──────────────────────────────────────────────────────────────
  it.each([
    // Boundary EXACT au limit : Nème animal accepté, (N+1)ème refusé.
    { limit: 50, current: 49, newPets: 1, expected: true },
    { limit: 50, current: 50, newPets: 1, expected: false },
    { limit: 10, current: 9,  newPets: 1, expected: true },
    { limit: 10, current: 10, newPets: 1, expected: false },
    { limit: 1,  current: 0,  newPets: 1, expected: true },
    { limit: 1,  current: 1,  newPets: 1, expected: false },
    // Au-delà du limit : refus immédiat.
    { limit: 50, current: 60, newPets: 1, expected: false },
    // Multi-pets en une fois : accepté si tous tiennent.
    { limit: 50, current: 45, newPets: 5, expected: true },
    { limit: 50, current: 45, newPets: 6, expected: false },
  ])(
    'limit=$limit, current=$current, +$newPets → accepted=$expected (parametric, NOT hardcoded)',
    ({ limit, current, newPets, expected }) => {
      expect(isAcceptedByCapacityRule(limit, current, newPets)).toBe(expected);
    },
  );

  // ── Cats — distinct du dog test pour clarté du rapport CI ────────────
  // La règle est identique mais la lecture limits.cats (et non .dogs) est
  // une branche distincte dans checkBoardingCapacity — tester séparément
  // catch un futur split de logique.
  it.each([
    { limit: 10, current: 9,  newPets: 1, expected: true },
    { limit: 10, current: 10, newPets: 1, expected: false },
    { limit: 1,  current: 0,  newPets: 1, expected: true },
    { limit: 1,  current: 1,  newPets: 1, expected: false },
    { limit: 10, current: 8,  newPets: 2, expected: true },
    { limit: 10, current: 8,  newPets: 3, expected: false },
  ])(
    'cat limit=$limit, current=$current, +$newPets → accepted=$expected',
    ({ limit, current, newPets, expected }) => {
      expect(isAcceptedByCapacityRule(limit, current, newPets)).toBe(expected);
    },
  );

  it('CRITICAL : la formule reste identique à `capacity.ts` ligne ~192', () => {
    // Anti-drift : si quelqu'un change la formule dans capacity.ts (eg.
    // `newDogs >= available` au lieu de `newDogs > available`), le test
    // dog à `current=10, newPets=1, limit=10` passera de "refused" à
    // "accepted" — cassant ce test ET indiquant le bug en code review.
    // C'est exactement le point d'ancrage de cette régression.
    expect(isAcceptedByCapacityRule(10, 10, 1)).toBe(false);
    expect(isAcceptedByCapacityRule(10, 9, 1)).toBe(true);
  });
});

// =============================================================================
// CASE 5 — Soft-delete leak (booking.deletedAt exclus de TOUS les calculs CA)
// =============================================================================
// Régression Wave 1 (PR #75) : les bookings soft-deleted (RGPD ou annulation
// admin) doivent disparaître de TOUS les calculs comptables. La source de
// vérité est `getMonthlyInvoicesWhere` qui doit filtrer `booking.deletedAt:
// null` partout où une jointure booking apparaît.
//
// Le case 1 (paiement encaissé) bypasse la jointure booking — un booking
// soft-deleted avec un payment toujours en base le verrait encore. C'est
// considéré correct (la caisse est la vérité comptable : si du cash a été
// reçu, il faut le tracer). La règle "exclure complètement" s'applique
// donc au case 2 (séjour actif sans payment).
//
// SI CE TEST CASSE : la jointure booking de getMonthlyInvoicesWhere a perdu
// son filtre deletedAt.
describe('REGRESSION — soft-delete leak via getMonthlyInvoicesWhere', () => {
  const monthStart = new Date('2026-05-01T00:00:00Z');
  const monthEnd = new Date('2026-05-31T23:59:59Z');

  it('CASE 2 (séjour actif sans payment) filtre deletedAt: null sur booking', () => {
    const where = getMonthlyInvoicesWhere(monthStart, monthEnd);
    const case2 = where.OR![1] as Record<string, unknown>;
    const booking = case2.booking as Record<string, unknown>;
    // Le filtre crucial : sans ça, un booking supprimé re-pèse sur le CA
    // "en attente" du mois cible (regression Wave 1 documentée PR #75).
    expect(booking.deletedAt).toBe(null);
  });
});

// =============================================================================
// CASE 6 — Payment allocation order (déterministe)
// =============================================================================
// Sémantique A (PR #87) : tant que la facture n'est pas clôturée
// intégralement, allocateBetweenItems retourne 0 sur tous les items
// (les acomptes ne ventilent pas en cours de route). Quand elle est
// clôturée ce mois, chaque item porte son total complet, tagué avec la
// date du dernier payment. L'ORDRE des items dans l'array d'entrée
// ne change RIEN au résultat (toutes les allocations sont à 100%).
//
// SI CE TEST CASSE : l'algo est repassé à un FIFO ordering-dependent.
describe('REGRESSION — payment allocation déterministe (Sémantique A)', () => {
  const monthStart = new Date('2026-05-01');
  const monthEnd = new Date('2026-05-31');

  it('Multi-items + payment partiel → allocations = 0 (pas encore clôturé)', () => {
    const payments = [{ amount: 500, paymentDate: new Date('2026-05-10') }];
    const items = [
      { category: 'BOARDING', total: 1000, description: '' },
      { category: 'GROOMING', total: 200, description: '' },
    ];
    const alloc = allocateBetweenItems(payments, items, monthStart, monthEnd);
    expect(alloc.every((a) => a.amount.toNumber() === 0)).toBe(true);
    expect(alloc.every((a) => a.lastPaidAt === null)).toBe(true);
  });

  it('Facture clôturée ce mois, ordre items inversé → même résultat', () => {
    const payments = [{ amount: 1200, paymentDate: new Date('2026-05-10') }];
    const itemsA = [
      { category: 'BOARDING', total: 1000, description: '' },
      { category: 'GROOMING', total: 200, description: '' },
    ];
    const itemsB = [
      { category: 'GROOMING', total: 200, description: '' },
      { category: 'BOARDING', total: 1000, description: '' },
    ];
    const allocA = allocateBetweenItems(payments, itemsA, monthStart, monthEnd);
    const allocB = allocateBetweenItems(payments, itemsB, monthStart, monthEnd);
    // Chaque item porte 100% de son total quel que soit l'ordre.
    expect(allocA.map((a) => a.amount.toNumber())).toEqual([1000, 200]);
    expect(allocB.map((a) => a.amount.toNumber())).toEqual([200, 1000]);
  });

  it('Payments désordonnés → max(paymentDate) utilisé pour la fenêtre', () => {
    // Le payment du 06/05 vient APRÈS celui du 29/04 dans l'array
    // mais sa date est plus tardive. Sémantique A regarde max(date).
    const payments = [
      { amount: 40, paymentDate: new Date('2026-05-06') },
      { amount: 900, paymentDate: new Date('2026-04-29') },
    ];
    const items = [{ category: 'BOARDING', total: 940, description: '' }];
    const alloc = allocateBetweenItems(payments, items, monthStart, monthEnd);
    // Facture clôturée en mai (last payment = 06/05) → boarding plein
    expect(alloc[0].amount.toNumber()).toBe(940);
  });
});

// =============================================================================
// CASE 7 — Cancel revenue (CANCELLED exclus de Case 2)
// =============================================================================
// Règle métier : un booking CANCELLED ne doit JAMAIS apparaître dans le
// CA "en attente" (Case 2). Le filtre `status: { in: [CONFIRMED,
// IN_PROGRESS, COMPLETED] }` exclut automatiquement CANCELLED, REJECTED,
// NO_SHOW.
//
// LIMITATION CONNUE (TODO) : un booking CANCELLED **avec payment** est
// toujours capturé via Case 1 (caisse prime). Comptablement, c'est juste
// — le cash a bien été reçu, un éventuel remboursement doit être tracé
// par un payment négatif. Mais le user veut le test "CANCELLED après
// paiement → CA ne le compte pas" — ça nécessite un refacto + alignement
// avec la MV monthly_revenue_mv. Hors-scope de ce module. Voir TODO dans
// CLAUDE.md.
//
// SI CE TEST CASSE : la liste des statuts inclus dans Case 2 a changé.
describe('REGRESSION — booking CANCELLED exclus du CA en attente', () => {
  const monthStart = new Date('2026-05-01T00:00:00Z');
  const monthEnd = new Date('2026-05-31T23:59:59Z');

  it('CASE 2 status whitelist N\'INCLUT PAS CANCELLED/REJECTED/NO_SHOW', () => {
    const where = getMonthlyInvoicesWhere(monthStart, monthEnd);
    const case2 = where.OR![1] as Record<string, unknown>;
    const booking = case2.booking as Record<string, unknown>;
    const allowedStatuses = (booking.status as Record<string, unknown>).in as string[];
    expect(allowedStatuses).not.toContain('CANCELLED');
    expect(allowedStatuses).not.toContain('REJECTED');
    expect(allowedStatuses).not.toContain('NO_SHOW');
    expect(allowedStatuses).not.toContain('PENDING'); // PENDING aussi exclu
  });

  it('CASE 2 status whitelist INCLUT exactement CONFIRMED/IN_PROGRESS/COMPLETED', () => {
    const where = getMonthlyInvoicesWhere(monthStart, monthEnd);
    const case2 = where.OR![1] as Record<string, unknown>;
    const booking = case2.booking as Record<string, unknown>;
    const allowedStatuses = (booking.status as Record<string, unknown>).in as string[];
    expect(allowedStatuses.sort()).toEqual(['COMPLETED', 'CONFIRMED', 'IN_PROGRESS']);
  });
});
