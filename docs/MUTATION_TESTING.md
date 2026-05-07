# Mutation testing — Stryker

## Pourquoi

Notre suite Vitest compte 441+ tests qui couvrent les modules métier (billing, accounting, loyalty, capacity, category). La couverture de lignes (line coverage) ne dit rien de la **qualité** des assertions — un test qui appelle une fonction sans vérifier le résultat affiche 100% de couverture mais ne détecte rien.

Le mutation testing répond à la question : **est-ce que mes tests cassent vraiment quand je casse le code de production ?**

Stryker mute le code (remplace `>` par `>=`, `+` par `-`, retourne `null` au lieu de la valeur, etc.) puis relance les tests. Si un test échoue → le mutant est "killed" (bonne nouvelle). Si tous les tests passent → mutant "survived" (mauvaise nouvelle, le test ne couvrait pas ce comportement).

## Quand lancer

- **Avant chaque release majeure** : confirmer que les tests gardent leur valeur.
- **Après une refonte significative** d'un module muté (`billing.ts`, `loyalty.ts`, etc.).
- **Pas en CI à chaque PR** : trop lent (~3-5 min). On préfère un job manuel ou hebdomadaire.

## Périmètre

Cible 5 modules à logique métier dense :

- `src/lib/billing.ts` — `getMonthlyInvoicesWhere`, `resolveItemCategory`, `computeMonthlyRevenueByCategory`
- `src/lib/accounting.ts` — allocations Payment → InvoiceItem
- `src/lib/loyalty.ts` — `calculateSuggestedGrade`, seuils
- `src/lib/capacity.ts` — `checkBoardingCapacity`, overlaps
- `src/lib/category.ts` — taxonomie des items

Ne pas étendre à tout `src/` — le run dépasserait 30 min et la valeur marginale est faible.

## Installation

Stryker n'est pas installé par défaut (deps lourdes). À l'install :

```bash
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner
npm run mutation
```

## Seuils

```json
"thresholds": { "high": 80, "low": 60, "break": 50 }
```

- `> 80%` : excellent
- `60–80%` : acceptable, à améliorer
- `< 50%` : **build casse** — ajouter des assertions

## Lecture du rapport

`reports/mutation/mutation.html` après chaque run. Filtrer par "Survived" pour voir les mutants non détectés.

Causes typiques :
- Test qui n'asserte pas la valeur retournée
- Branche conditionnelle sans test
- Edge case (NaN, null, empty array) non couvert

## Roadmap

Si le score < 70% sur un module, ajouter une story dans le backlog "tech-debt: increase mutation score on `<module>`".
