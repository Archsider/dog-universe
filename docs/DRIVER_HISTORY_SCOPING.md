# Scoping — Historique chauffeur sur `/admin/driver`

**Statut :** PROPOSITION — attendre validation Mehdi avant de coder
**Auteur :** Claude (2026-05-15, suite au fix timezone Casa qui a rendu visible le manque)
**Échelle :** 1-5 courses/jour, 500 familles, ~10 ans d'activité

---

## 1. Contexte exact

### Ce qu'il y a aujourd'hui sur `/admin/driver`

3 sections lues depuis `TaxiTrip` (PR #68 a pivoté de `Booking.serviceType` vers `TaxiTrip` pour fixer le compteur 0 km) :

| Section | Filtre | Tri |
|---|---|---|
| **En cours** | `status ∈ {DRIVER_EN_ROUTE, DRIVER_NEAR_PICKUP, DRIVER_AT_PICKUP, ANIMAL_ON_BOARD}` | `updatedAt desc` |
| **Aujourd'hui** | `date = casablancaDateOnly(now)` ET booking pas terminal | `time asc` |
| **Prochaines courses** | `date > today` | `date asc, time asc` |

### Ce qui manque

Aucune vue historique. Pour retrouver une course passée, Mehdi doit :
1. Aller dans `/admin/reservations` → onglet "history"
2. Filtrer manuellement par `serviceType=PET_TAXI` ou par client
3. Cliquer chaque réservation pour voir si elle avait un addon taxi

→ **Friction estimée 2 min/recherche** vs 5s avec une vue dédiée. Fréquence : 1-2 fois/semaine. Coût annuel : ~3h perdues.

---

## 2. Trois besoins métier réels (inventaire honnête)

| # | Cas d'usage | Fréquence | Données nécessaires |
|---|---|---|---|
| 1 | Retrouver une course passée pour répondre à un client ("vous avez fait quand le taxi pour Mamy ?") | 1×/sem | client, date, type, statut |
| 2 | Vérifier l'activité du chauffeur (Mehdi lui-même) sur la semaine écoulée | 1×/sem | date range + KPI volume |
| 3 | Pilotage opérationnel — "j'ai fait combien de courses en mai ?" / "quelle est la tendance ?" | 1×/mois | KPI mensuels + variation |

Cas 1+2 = consultation. Cas 3 = pilotage analytique.

---

## 3. Deux options

### Option A — MVP pragmatique (consultation pure)

**Périmètre** :
- Nouvel onglet `Historique` à côté de `Mode chauffeur` sur `/admin/driver`
- Tableau filtrable :
  - Date range (presets : 7j, 30j, mois courant, mois dernier)
  - Client (autocomplete via `ClientSearchSelect`, déjà existant)
  - Type (`OUTBOUND` | `RETURN` | `STANDALONE`)
  - Statut terminal (`ARRIVED_AT_PENSION` | `ARRIVED_AT_CLIENT` | `CANCELLED`)
- Pagination serveur 20/page (`take: 20, skip: cursor`)
- Tri par défaut : `date desc, time desc` (plus récent d'abord)
- Colonnes : Date, Heure, Client, Pets, Type, Statut, Distance (km), Adresses
- Export CSV via `escapeCsv()` (ré-utilise le pattern session 2026-03-20)

**Implémentation** :
- 1 endpoint API : `GET /api/admin/taxi-trips/history` avec filtres URL
- 1 page React : `/admin/driver/history` (Server Component pour la 1ère page, Client Component pour la pagination)
- 1 fonction `getTaxiTripHistory(filters)` dans `src/lib/services/taxi-history.service.ts` — testable unitairement
- Réutilisation maximum : `ClientSearchSelect` existe, `escapeCsv` existe, le pattern de pagination existe sur `/admin/reservations`

**Effort estimé** : **6-8 heures** (analyse + impl + tests + UI + relecture)

**Couvre** : Cas 1 + Cas 2

**Ne couvre pas** : Cas 3 (KPIs analytiques)

**Valeur** : récupère ~3h/an + débloque "où est ma course ?" instantané

---

### Option B — Vue analytique (consultation + pilotage)

**Périmètre = tout A, plus** :
- Bandeau KPI cards :
  - Courses ce mois (vs M-1 en %)
  - Km totaux ce mois (vs M-1)
  - CA taxi ce mois (somme `TaxiTrip.price` ou `BoardingDetail.taxiAddonPrice` selon `tripType`)
  - Distance moyenne par course
- Mini-graphique inline-SVG (zéro lib) : courses/jour sur 30j
- Top 5 destinations (par adresse `dropoffAddress` normalisée — risqué si typos)
- Top 5 clients (les plus gros consommateurs taxi)

**Implémentation** :
- Tout A, plus :
- 1 endpoint API : `GET /api/admin/taxi-trips/analytics` agrégé en SQL
- 1 composant `TaxiKpiBand.tsx` (réutilisable du pattern dashboard existant)
- 1 composant `TaxiSparkline.tsx` (inline SVG, pattern `/status` page)
- 1 query SQL d'agrégation Top 5 — risque de N+1 si naive

**Effort estimé** : **14-18 heures** (A + agrégation + chart + tests)

**Couvre** : Cas 1 + 2 + 3

**Coût caché** :
- Top 5 destinations : nécessite normalisation d'adresses (typos, casse, espaces) → faux positifs probables
- KPI CA taxi : existe déjà partiellement dans `/admin/analytics` (volume taxi mensuel) → risque de dupliquer une métrique avec une formule légèrement différente → drift comme le bug Rita
- Sparkline : utilité réelle douteuse à 1-5 courses/jour (résolution trop fine pour voir une tendance)

**Valeur** : ajoute un dashboard de plus à maintenir pour ~1×/mois de consultation

---

## 4. Recommandation argumentée

**👉 Option A.**

**Pourquoi A et pas B :**
- À 1-5 courses/jour, les KPIs analytiques n'apportent rien de plus que l'œil — un mois de courses tient dans un tableau de 100 lignes lisible en 30s
- B duplique partiellement ce qui existe déjà dans `/admin/analytics` (CA taxi mensuel) → risque de drift comme le bug Rita
- Le top 5 destinations n'a pas de sens à cette échelle (toutes les courses sont à Marrakech)
- L'effort B est 2-3× plus élevé pour une valeur d'usage marginale

**Pourquoi A maintenant :**
- Le bug timezone vient de rendre visible le manque (le compteur "aujourd'hui = 0" à 00h05 oblige à drill ailleurs)
- La friction actuelle (2 min/recherche) est réelle et hebdomadaire
- Effort raisonnable, zéro risque structural

**Évolutions futures envisageables (mais pas maintenant) :**
- Si la fréquence taxi double (10+/jour) → ajouter le sparkline (B partiel)
- Si Mehdi embauche un assistant → ajouter "courses par chauffeur" (B partiel)
- Mais NE PAS construire ces features en spéculation

---

## 5. Détails d'implémentation Option A (si validée)

### Endpoint

```ts
// GET /api/admin/taxi-trips/history?from=…&to=…&clientId=…&type=…&status=…&cursor=…
{
  trips: Array<{
    id, date, time, type, status,
    distanceKm, price,
    client: { id, name },
    petNames: string[],
    pickupAddress, dropoffAddress,
  }>,
  nextCursor: string | null,
  totalCount: number,
}
```

### Filtres

- `from` / `to` : `YYYY-MM-DD` Casa (passe par `dates-casablanca` côté borne UTC)
- `clientId` : optionnel, autocomplete
- `type` : optionnel, enum
- `status` : optionnel, enum (par défaut tous les statuts terminaux)
- `cursor` : id de pagination (cursor-based, plus stable que offset)

### Service

`src/lib/services/taxi-history.service.ts` — pure, testable :

```ts
export async function getTaxiTripHistory(params: {
  from?: Date;
  to?: Date;
  clientId?: string;
  type?: TaxiTripType;
  status?: TaxiTripStatus;
  cursor?: string;
  pageSize?: number; // default 20
}): Promise<{ trips: TripRow[]; nextCursor: string | null; totalCount: number }>
```

### Page UI

`src/app/[locale]/admin/driver/history/page.tsx` :
- Server Component pour la 1ère page (SEO + perf)
- `HistoryFilters.tsx` Client Component (filtres + URL sync via `searchParams`)
- `HistoryTable.tsx` Client Component (pagination cursor + export CSV)

### Tab nav

Modifier `/admin/driver/page.tsx` pour ajouter un onglet `<Tab>` Historique pointant vers `/admin/driver/history`.

### Tests

- Service : 8-10 tests Vitest sur les filtres (range vide, client inexistant, statut combiné, pagination cursor)
- API : 2-3 tests d'intégration auth (ADMIN/SUPERADMIN OK, CLIENT 403)

### Sécurité

- Route protégée par `requireRole(['ADMIN', 'SUPERADMIN'])` (ou pattern existant)
- Rate-limit `adminMutation` bucket (300/h) — existant
- Pas de PII dans logs (juste IDs)

### CSV

`escapeCsv()` existant + `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="taxi-history-YYYY-MM-DD.csv"`. Header BOM pour Excel.

---

## 6. Ce que j'attends de toi

1. **Confirmes-tu Option A ?** (ou tu veux B malgré tout)
2. **Onglet `/admin/driver/history` OK** ou tu préfères une route séparée style `/admin/operations` ?
3. **Une colonne particulière à inclure/exclure** dans le tableau ? (j'ai mis Date/Heure/Client/Pets/Type/Statut/Distance/Adresses)
4. **Export CSV nécessaire** dès la v1 ? (sinon je le mets dans une PR de suivi)

Une fois validé, je code en une PR atomique avec tests + docs en 6-8h, format Constat | Cause | Patch | Risks | Verify.
