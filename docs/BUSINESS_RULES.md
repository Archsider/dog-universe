# BUSINESS_RULES.md — Source de vérité métier Dog Universe

> Document permanent. **À mettre à jour à chaque changement de règle
> métier**. Toute divergence entre cette doc et le code est un bug —
> soit dans le code, soit dans la doc.
>
> Audience : moi futur (Mehdi), staff engineer Claude, comptable, fisc
> marocain en cas d'audit. Chaque règle doit être compréhensible sans
> ouvrir le code.

---

## Sommaire

1. [Calcul du CA mensuel par catégorie (Sémantique B)](#1-calcul-du-ca-mensuel-par-catégorie-sémantique-b)
2. [Loyalty — grades fidélité](#2-loyalty--grades-fidélité)
3. [Capacités de la pension](#3-capacités-de-la-pension)
4. [Allocation des paiements aux items](#4-allocation-des-paiements-aux-items)
5. [Soft-delete — User, Pet, Booking, Notification](#5-soft-delete--user-pet-booking-notification)
6. [Timezone — Africa/Casablanca (UTC+1 fixe)](#6-timezone--africacasablanca-utc1-fixe)
7. [Statuts de réservation — machine d'état](#7-statuts-de-réservation--machine-détat)
8. [Walk-in clients](#8-walk-in-clients)
9. [RGPD — anonymisation et purge](#9-rgpd--anonymisation-et-purge)

---

## 1. Calcul du CA mensuel par catégorie (Sémantique B)

> **Pivot 2026-05-17** : abandon de Sémantique A (paid-clôture, 2026-05-15 → 2026-05-17).
> Décision détaillée : [`docs/REVENUE_ATTRIBUTION_DECISION.md`](./REVENUE_ATTRIBUTION_DECISION.md).
> Impact comptable : [`docs/SEMANTIC_B_MIGRATION_IMPACT.md`](./SEMANTIC_B_MIGRATION_IMPACT.md) (généré par `scripts/semantic-b-impact-report.mjs`).

### Règle métier (français clair)

**Cash basis pure.** Chaque `Payment.amount` est attribué au mois Casa
de sa `paymentDate` — peu importe la date de la facture, du séjour, ou
de l'émission.

Pour la catégorie : chaque paiement est **réparti au prorata** des
`InvoiceItem.allocatedAmount` de la facture parente.

```
revenue(month, category) +=
  payment.amount * (sum(items.allocatedAmount où category=C) / sum(all items.allocatedAmount))
```

**Exclusion** : facture `CANCELLED` avec `paidAmount = 0` → ignorée
totalement.

### Quelle date saisir dans `paymentDate` ? (décision 2026-05-28)

`paymentDate` = **la date où l'argent est effectivement reçu en banque
(ou en caisse)**, PAS la date où le client a déclenché le paiement. C'est
ce qui aligne le CA de l'app sur le relevé bancaire et la déclaration
fiscale (régime encaissement).

| Moyen | `paymentDate` à saisir |
|---|---|
| Espèces | jour même (reçu en main) |
| TPE / carte | date de crédit banque (souvent +1 à +2 j) |
| Virement | date de valeur sur le relevé |
| Chèque | date d'encaissement du chèque |

**Cas fin de mois → encaissement le mois suivant** (TPE/virement de fin
mai crédités début juin) : enregistrer le paiement **immédiatement** (la
facture passe « Payée », plus de relance) avec une `paymentDate` au mois
suivant. L'app **accepte une date future** — aucune garde anti-future sur
`recordPayment` / `recordPaymentBodySchema`. Le CA tombe alors dans le bon
mois Casa (juin) automatiquement.
**Inclusion** : facture `CANCELLED` avec `paidAmount > 0` → conservée
(revenu acquis ; un éventuel remboursement physique est un `Payment`
négatif séparé, pas un effacement rétroactif).

### Règle technique

- **PG function (source de vérité)** : `compute_payment_by_category(year, month)` — voir `prisma/migrations/20260517_revenue_mv_semantic_b/migration.sql`
- **Materialized view (cache)** : `monthly_revenue_mv` (refresh horaire + daily)
- **Helper TS canonique** : `src/lib/billing/monthly-revenue.ts` — `getMonthlyRevenueByCategory(year, month)`
- **Pure TS twin (tests)** : `src/lib/billing/payment-attribution.ts` — `attributePaymentsToCategoryMonth(invoice)`
- **Garde ESLint** : règle `dog-universe/no-direct-revenue-computation` interdit `prisma.payment.aggregate({_sum: amount, where: paymentDate})` hors du helper canonique
- **Invariants horaires** : `#11 payment_attribution_drift` + `#12 revenue_helper_vs_live` (voir `src/lib/health-invariants.ts`)
- **Cron refresh** : `/api/cron/refresh-monthly-revenue` (horaire) + `/api/cron/refresh-revenue-mv` (daily 02h UTC). Tous deux appellent `markMVRefreshed()` UNIQUEMENT après un REFRESH réussi (si throw → pas de stamp → staleness signal préservé)

### Architecture fast / slow path

```
fast path (MV fresh < 2h)  →  read MV     +  waitUntil(drift check async)
slow path (MV stale > 2h)  →  computeLive +  sync drift alert (Sentry)
```

Fraîcheur lue depuis Redis key `mv:last_refresh:monthly_revenue_mv` (TTL
7j). En cas de Redis down → traité comme stale → fallback computeLive.

### Exemples prod (6 cas pivots verrouillés en CI)

| Facture | Paiements | Sémantique B |
|---|---|---|
| Anas Chekroun DU-0023 | 700 mai (résa avril) | 100% mai |
| Benjamin Boksenbaum DU-0033 | 480 mai (résa avril) | 100% mai |
| Imane Berrada DU-0028 | 950 avril | 100% avril |
| Rita Kabbaj DU-0030 | 900 avril + 40 mai | Split prorata sur les 2 mois |
| Alexandra Bon DU-0024 | 1000 avril + 940 mai | Split prorata sur les 2 mois |
| Marie Lagarde DU-0052 | CANCELLED, 0 paid | Exclu — 0 CA |

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS faire un `prisma.payment.aggregate({_sum: {amount: true}, where: {paymentDate: ...}})` hors du helper canonique → la règle ESLint #6 bloque le merge
- ❌ Ne JAMAIS coder un fallback "paid-clôture" pour rester "comme avant" : Sémantique B est la nouvelle source de vérité
- ❌ Ne JAMAIS écrire dans la MV directement — passer par REFRESH (déclenché par cron ou bouton SUPERADMIN `/admin/refresh-revenue-mv`)
- ❌ Ne JAMAIS modifier la formule en TS sans modifier la PG function en parallèle (les 7 tests régression hardcoded prod cassent immédiatement sinon)
- ❌ Ne JAMAIS faire `markMVRefreshed()` AVANT le REFRESH — sinon une staleness fantôme est stampée alors que la MV n'est pas à jour

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` §1 — 8 it() canoniques Sémantique B (les 6 cas pivots prod + CANCELLED full-paid + sumAttributionsForMonth)
- `src/lib/billing/__tests__/monthly-revenue.test.ts` — 11 tests helper TS (fast/slow path, Redis stamping, drift math)
- `eslint-rules/__tests__/no-direct-revenue-computation.test.js` — 7 valid / 4 invalid cases pour la règle de garde

---

## 2. Loyalty — grades fidélité

### Règle métier (français clair)

Quatre grades, calculés automatiquement à partir de **deux signaux** :

| Grade | Séjours terminés | OU revenu cumulé (MAD) |
|---|---:|---:|
| **BRONZE** | 1 à 3 | — |
| **SILVER** | 4 à 9 | — |
| **GOLD** | 10 à 19 | — |
| **PLATINUM** | 20 et plus | **OU** ≥ 55 000 MAD |

C'est un **OU** : un client peut atteindre PLATINUM via le nombre de
séjours OU via le revenu cumulé. Le revenu n'a pas d'effet sur les
grades intermédiaires (BRONZE/SILVER/GOLD) — seulement sur PLATINUM.

L'admin peut **toujours faire un override manuel** (champ
`LoyaltyGrade.isOverride`). L'override désactive le calcul auto pour
ce client.

**Les seuils ne sont jamais affichés au client.** Le client voit son
grade actuel et la barre de progression, pas le détail "X séjours pour
GOLD".

### Règle technique

- Fonction pure : `src/lib/loyalty.ts:17` `calculateSuggestedGrade(totalStays, totalRevenueMAD)`
- Seuils : `src/lib/loyalty.ts:8` `STAY_THRESHOLDS` constante (objet figé)
- Seuil PLATINUM par revenu : `src/lib/loyalty.ts:15` `REVENUE_THRESHOLD_PLATINUM = 5000 * 11 = 55 000 MAD`
- Modèle DB : `prisma/schema.prisma` `LoyaltyGrade` (1-to-1 avec User,
  champ `isOverride: Boolean`)
- Cache Redis : `cache:loyalty:<userId>` TTL 5 min, invalidé sur
  upsert/override

### Exemple prod

- Client avec 9 nuitées + 100 MAD de revenu → **SILVER** (4-9 nuitées)
- Client avec 4 nuitées et 60 000 MAD → **PLATINUM** (revenu seul
  suffit)
- Client avec 20 nuitées mais 0 MAD → **PLATINUM** (séjours seul)

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS modifier les seuils sans accord explicite. Ces valeurs
  sont protégées par un test régression et un commentaire CLAUDE.md
  "NE PAS MODIFIER".
- ❌ Ne JAMAIS afficher les seuils internes au client. UI client = juste
  le grade actuel + une barre de progression sans valeur chiffrée.
- ❌ Ne PAS confondre `LoyaltyGrade.grade` (état persistent en DB) et
  le résultat de `calculateSuggestedGrade()` (suggestion auto). L'admin
  peut diverger via `isOverride`.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — loyalty tier auto-suggestion boundaries"
- Couvre les 9 bornes : 1, 3, 4, 9, 10, 19, 20 séjours + 54 999 et
  55 000 MAD pour la branche revenu.

---

## 3. Capacités de la pension

### Règle métier (français clair)

La pension a une **capacité maximale** par espèce :

| Espèce | Capacité actuelle |
|---|---:|
| Chiens | **50** |
| Chats | **10** |

Ces valeurs sont **stockées en base** (table `Setting`, clés
`capacity_dog` et `capacity_cat`). **Elles peuvent être modifiées à
chaud** par un admin via `/admin/settings` — pas besoin de redéployer.

Quand une nouvelle réservation arrive (côté client OU côté admin), le
système compte combien d'animaux de la même espèce sont déjà confirmés
sur la fenêtre de dates demandée. Si l'ajout dépasse la limite, la
réservation est **refusée** avec l'erreur `CAPACITY_EXCEEDED`.

Les statuts **PENDING, CONFIRMED, IN_PROGRESS** comptent dans
l'occupancy (un PENDING non encore validé réserve quand même la place
— prévention race condition).

### Règle technique

- Valeurs vivantes : table `Setting` rows `capacity_dog` / `capacity_cat`
- UI admin pour modifier : `/admin/settings` → `PricingForm.tsx:31`
  champ "Capacité chiens / chats"
- Lecture : `src/lib/capacity.ts:88` `getCapacityLimits(client?)`
- Cache Redis 5 min : `src/lib/cache.ts:120` `CacheKeys.capacityLimits()`,
  TTL `src/lib/cache.ts:128` `CacheTTL.capacityLimits = 300`
- Invalidation cache après update : `src/lib/capacity.ts:92`
  `invalidateCapacityCache()` (appelée par la route PATCH settings)
- Fallback si DB vide : `src/lib/capacity.ts:24` `DEFAULT_LIMITS = { dogs: 50, cats: 10 }` (aligné prod 2026-05-15)
- Check effectif sur création booking : `src/lib/capacity.ts:166`
  `checkBoardingCapacity(args, client?)`
- Formule de décision : `available = max(0, limit - currentlyOccupying)`,
  puis `ok = newPets <= available`

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS hardcoder "50" ou "10" dans le code applicatif. La valeur
  vit en DB pour pouvoir bouger sans deploy. Si tu ajoutes une nouvelle
  feature qui dépend de la capacité, passe par `getCapacityLimits()`.
- ❌ Ne JAMAIS hardcoder "50" dans un test métier. Cf. cas 4 de
  `business-regression.test.ts` — la formule est testée à toute valeur
  N via `it.each` pour rester verte quelle que soit la capacité prod
  actuelle.
- ❌ Ne PAS oublier d'appeler `invalidateCapacityCache()` après update
  Setting. Sans ça, le cache Redis 5 min sert l'ancienne valeur (et la
  next réservation passe ou est refusée à tort).
- ⚠ Dans une transaction Serializable (création booking) : `getCapacityLimits(tx)`
  avec le client transactionnel pour participer au snapshot. Sinon
  race possible.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — capacity boundary (DB-driven, parametric)" — couvre limit=1, 10, 50
  pour chiens ET chats + variations multi-pets + anti-drift `>` vs `>=`.
- `src/lib/__tests__/capacity.test.ts` — suite complète unit + cache
  invalidation.

---

## 4. Allocation des paiements aux items

### Règle métier (français clair)

Quand une facture multi-lignes (par exemple Pension + Toilettage +
Taxi) est payée en plusieurs fois, on a besoin de savoir **quelle
ligne est créditée de combien**. Cette allocation alimente le
drill-down par catégorie sur `/admin/analytics`.

**Sous Sémantique A** (voir §1) :
- Tant que la facture **n'est pas intégralement payée**, toutes les
  allocations sont à **zéro**. Aucun item ne porte un acompte partiel.
- Quand la facture est intégralement payée, **chaque item porte son
  total complet**, tagué avec la date du **dernier paiement** (celui
  qui ferme la facture).
- **L'ordre des items est indifférent** — quel que soit l'ordre de
  saisie en DB, le résultat final est identique.

### Règle technique

- Fonction pure : `src/lib/accounting.ts:213` `allocateBetweenItems(payments, items, monthStart, monthEnd)`
- Même gate que la ventilation : `isInvoiceClosedInMonth` (cf. §1)
- Champ DB cible : `InvoiceItem.allocatedAmount` (Decimal 10,2)
- Drill-down consommateur : `/admin/analytics` page → utilise
  `allocateBetweenItems`

### Exemple prod — Rita (suite §1)

Acompte 900 MAD (29/04) + solde 40 MAD (06/05) → facture clôturée le
06/05.

| Ligne | total | allocatedAmount | lastPaidAt |
|---|---:|---:|---|
| Pension Mamy | 840 | 840 | 2026-05-06 |
| Toilettage Mamy | 100 | 100 | 2026-05-06 |

Si on inverse l'ordre des lignes (Toilettage avant Pension), même
résultat — l'allocation est **déterministe et ordre-indépendante** sous
Sémantique A.

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS écrire `InvoiceItem.allocatedAmount` à la main depuis
  un endpoint custom. Toujours passer par le helper qui réutilise
  `allocateBetweenItems` (à factoriser dans Module 4 sous
  `src/lib/payment-allocation.ts`).
- ❌ Ne PAS supposer qu'un acompte alloue partiellement. Sous
  Sémantique A, **l'acompte n'alloue rien tant que la facture n'est
  pas close**. Si tu vois `allocatedAmount > 0` sur une facture
  PARTIALLY_PAID, c'est un bug (cf. invariant `item_allocated_overflow`
  Module 1).
- ❌ Ne PAS croire qu'inverser l'ordre des items change le CA par
  catégorie. C'était le cas sous l'ancien algo FIFO (bug Rita). Plus
  jamais.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — payment allocation déterministe (Sémantique A)"
- 3 assertions : acompte=0, ordre items indépendant, max(paymentDate)
  pour la fenêtre.

---

## 5. Soft-delete — User, Pet, Booking, Notification

### Règle métier (français clair)

Quand un objet est "supprimé" dans l'app, on ne le détruit **jamais**
en base. On marque `deletedAt = now()` et on filtre toutes les lectures
sur `deletedAt: null`. Ça permet :

- de garder l'**audit** (comptable, RGPD, judiciaire)
- de **restaurer** un objet supprimé par erreur (admin technique)
- de purger réellement plus tard (RGPD — voir §9)

**Tables concernées** : `User`, `Pet`, `Booking`, `Notification`
(uniquement les types `ADMIN_MESSAGE` et `END_STAY_REPORT`).

### Règle technique

- Champs DB : chaque table concernée a `deletedAt: DateTime?` + index
  - `prisma/schema.prisma` `User.deletedAt` ligne 40 + index ligne 65
  - `Pet.deletedAt` ligne 102 + index ligne 111
  - `Booking.deletedAt` ligne 180 + index ligne 204
  - `Notification.deletedAt` ligne 485 + index ligne 495
- Helper d'écriture : `src/lib/prisma-soft.ts` `notDeleted({...})` ajoute
  `deletedAt: null` à un where clause
- Source de vérité comptable : `src/lib/billing.ts:42`
  `getMonthlyInvoicesWhere` — le case 2 (séjour actif sans payment)
  filtre `booking.deletedAt: null` pour exclure les bookings supprimés
  du CA "en attente"

### Exemple — soft-delete leak (corrigé Module 2, PR #91)

**Avant** : une réservation soft-deleted avec statut CONFIRMED
chevauchant un mois apparaissait dans le CA "en attente" du dashboard.
Cash fantôme, comptabilité fausse.

**Après** : `booking.deletedAt: null` ajouté au case 2 de
`getMonthlyInvoicesWhere`. La réservation supprimée disparaît du CA
ET du dashboard.

**Note** : le case 1 (paiement encaissé dans le mois) **ne filtre pas**
sur `booking.deletedAt`. C'est intentionnel — si du cash a été
encaissé, il doit être tracé même si la réservation est supprimée
ensuite. Un remboursement doit être saisi comme paiement négatif.

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS faire `prisma.X.delete()` sur User/Pet/Booking/Notification.
  Toujours `prisma.X.update({ where, data: { deletedAt: new Date() } })`.
- ❌ Ne JAMAIS oublier `deletedAt: null` dans une nouvelle query
  `findMany` / `findFirst` côté client. Le helper `notDeleted()` est
  là pour ça (mais ~99 occurrences inline subsistent — pattern toléré).
- ❌ Ne PAS croire qu'un soft-delete = aucune trace. Le ActionLog
  capture qui a fait quoi avec `payloadBefore` complet.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — soft-delete leak via getMonthlyInvoicesWhere"
- Vérifie que `case 2` de `getMonthlyInvoicesWhere` contient bien
  `booking.deletedAt: null`.

---

## 6. Timezone — Africa/Casablanca (UTC+1 fixe)

### Règle métier (français clair)

Toutes les **bornes de filtre métier** ("aujourd'hui", "ce mois",
"hier") sont calculées en **Africa/Casablanca**, pas en UTC.

Le Maroc est en **UTC+1 constant** depuis l'abolition du changement
d'heure en 2018. Aucune DST. On peut donc faire toute la maths avec
un offset fixe.

### Règle technique

- Module canonique : `src/lib/dates-casablanca.ts`
- Offset : `src/lib/dates-casablanca.ts:25` `CASA_OFFSET_MINUTES = 60`
- Helpers principaux :
  - `casablancaDateOnly(d)` ligne 36 — retourne `"YYYY-MM-DD"` côté Casa
  - `startOfDayCasa(d)` ligne ~85 — début de jour Casa en UTC
  - `endOfDayCasa(d)` ligne ~95 — fin de jour
  - `startOfMonthCasa(d)`, `endOfMonthCasa(d)` — bornes de mois
  - `daysUntilCasablanca(end, from)` ligne 72 — différence en jours
    calendaires Casa
- Module legacy de compat : `src/lib/timezone.ts` — re-exporte vers
  `dates-casablanca` pour rétrocompat des anciens call sites

### Exemple prod — bug Wave 1 #2

**Avant** : à 00h15 Casa le 15 mai (= 23h15 UTC le 14 mai), un booking
créé "maintenant" via le dashboard apparaissait avec date "14 mai" —
l'utilisation de `new Date().getUTCDate()` lisait UTC, pas Casa. Le
dashboard montrait "Départ demain" pour un booking à J+2.

**Après** : `casablancaDateOnly(new Date())` retourne `"2026-05-15"`.

| Instant UTC | Date Casa attendue |
|---|---|
| `2026-05-14T22:30:00Z` | `2026-05-14` |
| `2026-05-14T23:00:00Z` | `2026-05-15` (minuit Casa exact) |
| `2026-05-14T23:30:00Z` | `2026-05-15` |

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS utiliser `new Date().getDate()` / `.getUTCDate()` pour
  calculer "aujourd'hui" sur Vercel. Vercel runtime est en UTC. Tout
  passage doit aller via `casablancaDateOnly` / `startOfDayCasa`.
- ❌ Ne JAMAIS utiliser `date-fns` `startOfMonth` / `endOfMonth` pour
  les KPI mensuels. Ces fonctions sont timezone-naïves. Toujours
  `startOfMonthCasa` / `endOfMonthCasa`.
- ❌ Ne PAS oublier le passage UTC→Casa quand on stocke en DB. Les
  Date Prisma sont en UTC ; les afficher comme "aujourd'hui" exige le
  passage explicite par les helpers.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — timezone Casablanca (UTC+1, no DST)"
- `src/lib/__tests__/dates-casablanca.test.ts` — suite étendue
  (24 tests : rollover Dec→Jan, 22:30→23:30 UTC boundaries, etc.)

---

## 7. Statuts de réservation — machine d'état

### Règle métier (français clair)

Une réservation suit une machine d'état stricte :

```
   PENDING ──────► CONFIRMED ──────► IN_PROGRESS ──────► COMPLETED
       │                │                  │
       │                │                  └────► NO_SHOW
       │                │
       └────► REJECTED  └────► CANCELLED
```

| Statut | Sens | Compte dans CA "en attente" ? |
|---|---|---|
| `PENDING` | Demande client non encore validée | Non |
| `CONFIRMED` | Validée par admin, séjour à venir | **Oui** (case 2) |
| `IN_PROGRESS` | Animal actuellement dans la pension | **Oui** (case 2) |
| `COMPLETED` | Séjour terminé | **Oui** (case 2) |
| `CANCELLED` | Annulée par admin ou client | Non |
| `REJECTED` | Refusée par admin | Non |
| `NO_SHOW` | Client ne s'est pas présenté | Non |
| `WAITLIST` | En liste d'attente capacité | Non |
| `PENDING_EXTENSION` | Demande d'extension en attente validation | Variable |

Les statuts qui **comptent dans l'occupancy capacité** sont
`PENDING + CONFIRMED + IN_PROGRESS` (un PENDING non-validé réserve
quand même la place — anti race condition).

### Règle technique

- Enum DB : `prisma/schema.prisma:383` `enum BookingStatus`
- Transitions admin : `src/lib/services/booking-admin/status-transitions.ts`
- Validation statut sur PATCH : `VALID_STATUSES` whitelist dans la
  route admin
- Filtre comptable case 2 : `src/lib/billing.ts` ligne ~60 — exactement
  `['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']`
- Filtre capacité (statuts actifs) : `src/lib/capacity.ts` `ACTIVE_STATUSES`

### Exemple — CANCELLED après paiement (limitation connue)

Un client paie 1000 MAD pour une réservation en mai. La réservation
est ensuite annulée. Le booking passe en `CANCELLED`.

**Aujourd'hui** :
- Case 2 (séjour actif sans paiement) : exclut CANCELLED → OK
- Case 1 (paiement encaissé dans le mois) : ne filtre PAS sur le
  status booking → le payment de 1000 MAD reste compté dans le CA de
  mai

C'est défendable comptablement (le cash a été reçu). Pour le faire
disparaître, saisir un payment négatif (-1000 MAD) à la date du
remboursement.

**TODO** (cf. CLAUDE.md) : refacto pour aussi exclure case 1
"CANCELLED+paid" si Mehdi le valide explicitement (impacte
`monthly_revenue_mv`, nécessite migration MV).

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS introduire un nouveau statut sans mettre à jour les
  whitelists `VALID_STATUSES` + `ACTIVE_STATUSES` + le case 2 de
  `getMonthlyInvoicesWhere` selon la sémantique souhaitée.
- ❌ Ne JAMAIS supprimer un booking pour "annuler". `CANCELLED` est
  le statut prévu. Suppression = soft-delete (RGPD ou erreur de
  saisie).
- ❌ Ne PAS supposer qu'un `CANCELLED` efface le cash. Le cash reste
  jusqu'à un payment négatif.

### Tests régression

- `src/lib/__tests__/business-regression.test.ts` describe "REGRESSION
  — booking CANCELLED exclus du CA en attente"
- Vérifie la whitelist exacte `[CONFIRMED, IN_PROGRESS, COMPLETED]`.

---

## 8. Walk-in clients

### Règle métier (français clair)

Un **walk-in** est un client physique qui arrive sans réservation
préalable et sans compte sur le portail. L'admin crée à la fois le
client et la réservation à la volée.

Caractéristiques :
- Pas d'email réel (souvent un placeholder ou vide)
- Pas de mot de passe (pas de portail client)
- **Aucun email de notification** ne lui est envoyé
- **Aucun SMS COMPTA** non plus (cf. ADR-0008 Respectful SMS Policy —
  Walk-in + COMPTA → skip total)
- Peut être "promu" en vrai client plus tard si Mehdi décide de lui
  créer un compte (les bookings restent liés)

Le flag `User.isWalkIn` est **distinct** du flag `Booking.isWalkIn` —
un client peut rejoindre le portail tout en ayant historiquement des
bookings walk-in.

### Règle technique

- Champ `User.isWalkIn`: `prisma/schema.prisma:28` Boolean default false
- Champ `User.anonymizedAt` : `prisma/schema.prisma:33` DateTime? (cf. §9 RGPD)
- Champ `Booking.isWalkIn` : `prisma/schema.prisma:167` Boolean default
  false (indépendant pour permettre la "promotion")
- Détection effective : `booking.isWalkIn || booking.client.isWalkIn`
  (l'un OU l'autre)
- Index hot path admin : `User(role, isWalkIn)` ligne 66 + `Booking(isWalkIn)` ligne 207
- Filtre exclusion contracts : page `/admin/contracts` + cron
  `contract-reminders` filtrent `isWalkIn: false` (les walk-ins n'ont
  pas de portail donc pas de contrat attendu)
- Dédoublonnage téléphone : à la création walk-in, si un client existe
  avec le même téléphone et `isWalkIn: true, deletedAt: null`, on le
  réutilise (pas de doublon).

### Exemple prod

Un client se présente sans réservation, un samedi à 18h. Mehdi crée :
- User : `isWalkIn: true`, `email: 'walkin-+212600000001@doguniverse.ma'` (placeholder)
- Booking : `isWalkIn: true`, status `IN_PROGRESS` directement (l'animal
  est déjà sur place)
- Aucun email envoyé
- Si SMS de confirmation prévu → skip via la policy COMPTA+walkin

Quand le client revient 3 mois plus tard et veut un compte portail :
- Mehdi met `User.isWalkIn: false` + ajoute un email réel + reset password
- Les bookings historiques gardent `Booking.isWalkIn: true`

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS envoyer un email à un walk-in en se basant uniquement
  sur la présence d'un email. Toujours checker `isWalkIn` d'abord.
- ❌ Ne JAMAIS confondre `User.isWalkIn` et `Booking.isWalkIn`. La
  détection effective est `booking.isWalkIn || booking.client.isWalkIn`.
- ❌ Ne PAS filtrer une page admin avec `role: 'CLIENT'` sans aussi
  filtrer `isWalkIn: false` si la page concerne des clients "portail"
  (contrats, emails, etc.).
- ❌ Ne PAS oublier `User_role_isWalkIn_idx` (migration manuelle
  20260512). Sans cet index, full table scan sur chaque page admin
  filtrée par rôle.

### À CONFIRMER MEHDI

- ❓ Y a-t-il un cas où on **doit** envoyer un SMS à un walk-in (par
  exemple confirmation taxi vétérinaire) ? Aujourd'hui la policy SMS
  catégorie OPS envoie quand même (seul COMPTA est skip). À valider.

### 8.bis Facture walk-in paid-on-the-spot (depuis 2026-05-16)

**Cas distinct** : transaction encaissée immédiatement (boutique
croquettes, toilettage rapide, etc.). Pas un séjour. L'endpoint
`POST /api/admin/walkin-invoice` (ADMIN/SUPERADMIN) crée en une
seule transaction :
- Un `Booking` fantôme : `status='COMPLETED'`, `isWalkIn=true`,
  `source='WALKIN'`, `startDate=endDate=paymentDate`. ServiceType
  cosmétique (BOARDING par défaut — il n'y a pas d'enum WALKIN).
- Une `Invoice` liée, avec `clientDisplayName` override si client
  anonyme.
- N `InvoiceItem` (multi-lignes, DISCOUNT négatif autorisé).
- Un `Payment` via `recordPayment(trustedAmount: true)` post-commit.

**Client anonyme** : id null → résout vers l'user lazy-created
`walkin-anonymous@dog-universe.local` (single row partagé, `isWalkIn:
true`). L'override `Invoice.clientDisplayName` permet de différencier
visuellement chaque transaction même si elles partagent le même
client générique.

**Idempotency-Key OBLIGATOIRE** (pas back-compat). Replay → renvoie
l'invoice existante via `Booking.idempotencyKey = 'walkin:<key>'`.

**Sur le calendrier** : badge violet `🛒 Walk-in` distinct des
chips status standard, et exclus du compteur "petsToday" (pas
physiquement dans le kennel).

Cf. CLAUDE.md "WALK-IN UI" pour la spec complète et les tests.

---

## 9. RGPD — anonymisation et purge

### Règle métier (français clair)

Un client peut demander à voir ses données (export) ou à les
supprimer (anonymisation). L'anonymisation **ne supprime pas
immédiatement** — elle :

1. Remplace les identifiants par des placeholders (`anonymized-uuid@...`)
2. Stamp `User.anonymizedAt = now()`
3. Soft-delete le User (`deletedAt = now()`)
4. Conserve les bookings + invoices passés pour la comptabilité

La **purge réelle** (suppression définitive en base) intervient **3
ans après l'anonymisation**, via un cron mensuel. Cette purge supprime
les User anonymisés ET tous leurs ActionLog, AdminNote, etc.

Les `SmsLog` sont purgés plus tôt — **90 jours** après création — par
le même cron (pas de raison de garder 3 ans de logs SMS).

### Règle technique

- Champ `User.anonymizedAt` : `prisma/schema.prisma:33` DateTime?
- Route export : `POST /api/user/export` (download JSON)
- Route anonymisation : `POST /api/user/anonymize` (action client)
- Cron purge : `/api/cron/purge-anonymized` — schedule `0 2 1 * *`
  (1er du mois à 02h00 UTC, mensuel)
- Helper : `src/lib/rgpd-purge.ts:38` `runPurgeAnonymized()`
- Cutoffs :
  - `src/lib/rgpd-purge.ts:22` `THREE_YEARS_MS` pour User anonymisés
  - `src/lib/rgpd-purge.ts:23` `NINETY_DAYS_MS` pour SmsLog
- Manual trigger SUPERADMIN : `POST /api/admin/cron-trigger/purge-anonymized`
- Cap batch : 200 users par run (évite Lambda OOM)

### Runbook : "le cron purge-anonymized ne fire jamais"

Voir [`docs/CRON_RECOVERY.md`](./CRON_RECOVERY.md) — runbook 4 étapes :

1. Confirmer la présence dans `vercel.json`
2. Trigger manuel SUPERADMIN pour valider le code
3. Forcer Vercel à re-syncer les schedules (empty commit OU bouton
   Redeploy)
4. Escalade Vercel si rien après scheduled time + 30 min

**Watchdog automatique** : si un cron a `lastRun === null` pendant
>48h après son ajout, SMS automatique au SUPERADMIN (cf. Module Bug B,
`src/lib/cron-freshness.ts`).

### Exemple prod

Un client demande l'anonymisation le 15 mai 2026.

- 15 mai 2026 : `anonymizedAt = 2026-05-15T...`, données placeholders,
  user soft-deleted
- 15 mai 2029 (≈ 3 ans plus tard) : le cron mensuel purge la row User
  + tous les ActionLog liés
- Les bookings + invoices restent (anonymes) pour la comptabilité

### Pièges / "ne JAMAIS faire"

- ❌ Ne JAMAIS hard-delete un User directement. Toujours passer par la
  route `/api/user/anonymize` (depuis le portail client) OU par
  l'opération admin équivalente (à venir).
- ❌ Ne JAMAIS modifier `THREE_YEARS_MS` ou `NINETY_DAYS_MS` sans valider
  la conformité légale (loi 09-08 marocaine).
- ❌ Ne PAS oublier que le cron est **mensuel**. Le watchdog
  cron-freshness va alerter 48h après son ajout pour faux positif (cron
  pas encore tiré le 1er du mois) — la mitigation est de trigger
  manuellement une fois (`POST /api/admin/cron-trigger/purge-anonymized`)
  pour stamp `markCronRun` et désarmer le watchdog. Cf. CRON_RECOVERY.md.

### Tests régression

- ❓ Aucun test dans `business-regression.test.ts` pour ce sujet
  aujourd'hui. À CONFIRMER MEHDI : faut-il ajouter un cas régression
  "User anonymisé 3 ans → purgé au cron mensuel" ?

---

## 10. Garde-fous ESLint (Module 4-B)

Quatre familles de bugs ont été chassées en production ces dernières
semaines. Chacune correspond désormais à une règle ESLint maison
(plugin `eslint-plugin-dog-universe`, livré en `error` → bloque la CI).

| Règle | Famille de bug | Documentation |
|---|---|---|
| `no-getmonth-on-date-casa` | TZ drift (`.getMonth()` sur Vercel UTC retourne le mois précédent en Casa) | docs/ESLINT_RULES.md §1 |
| `no-money-tofixed` | Perte de précision Decimal (Rita 120,10 vs 120,105) | docs/ESLINT_RULES.md §2 |
| `no-direct-payment-create` | Bypass de `recordPayment` (cache CA, cross-role, SMS OPS, dedup) | docs/ESLINT_RULES.md §3 |
| `no-prisma-date-without-helper` | `new Date()` dans une query Prisma sur colonne date | docs/ESLINT_RULES.md §4 |
| `no-direct-invoice-mutation` | `prisma.invoice.update` direct sur `paidAmount`/`amount`/`status`/`paidAt`/`version` | docs/ESLINT_RULES.md §5 |

**Règle d'usage** :
- **Ne JAMAIS** désactiver une règle au niveau `.eslintrc.json` pour
  faire passer un commit. Soit on fixe, soit on disable inline avec
  une justification d'une ligne (convention `-- OK: <reason>`).
- Tests, `scripts/`, `prisma/`, et `eslint-rules/` sont les seuls
  contextes globalement whitelistés (fixtures de RuleTester, migrations
  SQL maison, etc.).
- Toute nouvelle PR doit produire `npm run lint` au vert.

**Comment ajouter une 5ᵉ règle** : voir docs/ESLINT_RULES.md "Adding a
new rule". Pattern : `RuleTester` de `eslint` + parser
`@typescript-eslint/parser` + vitest auto-pick.

---

## Mise à jour de ce document

**Quand** : à chaque PR qui modifie une règle métier listée ici.
**Qui** : l'auteur de la PR. **Comment** : update la section
correspondante + cite la PR dans le changelog ci-dessous.

### Changelog

- **2026-05-15** : création initiale (Module 3, PR #92). 9 sections.
  Tous helpers cités au commit `2faad61` (post-merge Module 2).
- **2026-05-16** : ajout §10 "Garde-fous ESLint" (Module 4-B). Plugin
  `eslint-plugin-dog-universe` avec 4 règles `error` qui empêchent la
  réintroduction des familles de bugs TZ / Decimal / payment-bypass /
  prisma-new-Date.
- **2026-05-16** : ajout §8.bis "Facture walk-in paid-on-the-spot"
  (PR WALKIN UI). Endpoint `POST /api/admin/walkin-invoice` + modal 3
  étapes sur `/admin/billing` + badge violet calendrier.
