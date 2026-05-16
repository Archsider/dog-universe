# Revenue Attribution — Sémantique A → Sémantique B

> Date du pivot : **2026-05-17**.
> Decided by : Mehdi (owner) + claude.
> Status : **DECIDED — Sémantique B in force**.
> Supersedes : Sémantique A (2026-05-15 → 2026-05-17, 2 jours en prod).
> Rollback : 30 secondes via le bloc commenté de `prisma/migrations/20260517_revenue_mv_semantic_b/migration.sql`.

---

## TL;DR

Dog Universe attribue désormais chaque `Payment.amount` au **mois de
`Payment.paymentDate`** (Casa), avec une catégorisation au prorata des
`InvoiceItem.allocatedAmount` de la facture parente. Une seule formule,
implémentée dans la PG function `compute_payment_by_category`, cachée
dans la MV `monthly_revenue_mv`, consommée via le helper
`getMonthlyRevenueByCategory()` (point d'entrée canonique unique, garanti
par la règle ESLint `dog-universe/no-direct-revenue-computation`).

---

## 1. Avant — Sémantique A (paid-clôture)

```
Revenue(invoice, M) =
  invoice.amount  si  invoice.status = PAID
                  ET  last(invoice.payments).paymentDate ∈ M
  0               sinon
```

**Problèmes constatés en prod (avril-mai 2026) :**

| # | Problème | Conséquence |
|---|---|---|
| A | Facture acompte avril 900 MAD + solde mai 40 MAD → 100% sur mai | Avril sous-déclaré, mai sur-déclaré |
| B | Facture CANCELLED full-paid comptée comme PAID dans la MV | CA fantôme |
| C | "Total Facturé" (page billing, accrual) ≠ "Total Encaissé" (dashboard, cash) | Mehdi devait expliquer 4 chiffres au comptable |
| D | Extrait bancaire ≠ CA dashboard | Déclaration fiscale faite manuellement à partir des relevés |

**Pourquoi A a été choisi initialement (historique 2026-05-15) :**
simplicité algorithmique — une seule décision par invoice, pas de
prorata, pas de split. Tradeoff acceptable au démarrage, insoutenable
dès qu'un acompte traverse une frontière de mois.

---

## 2. Après — Sémantique B (cash basis pure)

```
Pour chaque Payment p :
  monthBucket(p) = mois Casa de p.paymentDate

  Pour chaque category c apparaissant dans p.invoice.items :
    revenue(monthBucket(p), c) +=
      p.amount * (sum(items.allocatedAmount où category=c) / sum(items.allocatedAmount))

Exclusion : Invoice CANCELLED AND paidAmount = 0  →  rien à compter.
Inclusion : Invoice CANCELLED AND paidAmount > 0  →  revenu acquis
  (refund éventuel = Payment négatif si remboursement physique).
```

**Avantages :**

1. **Match comptable** : la déclaration fiscale est faite sur la base
   d'encaissement. Sémantique B retourne directement le bon chiffre.
2. **Match bancaire** : la somme des `Payment` d'un mois Casa doit
   égaler les crédits du même mois sur l'extrait bancaire (modulo timing
   chèques + virements pas encore crédités). Invariant horaire #11.
3. **Découplage prix-facture / encaissement** : une remise post-facturation
   ne décale plus le CA du mois ; elle affecte juste l'allocated du mois
   du paiement résiduel.
4. **Une seule formule, un seul caller** : helper TS canonique →
   `getMonthlyRevenueByCategory(year, month)` ; PG function unique →
   `compute_payment_by_category(year, month)`. ESLint rule #6 interdit
   tout bypass.

**Inconvénients (assumés) :**

- **Comparaisons month-over-month plus volatiles** : un client qui
  paie en retard de 2 mois fait gonfler le mois M+2. Acceptable car
  c'est exactement ce qu'attend le comptable.
- **Recalculs historiques sur ajustement** : si Mehdi annule un Payment
  postérieur, le mois cible change. Compensé par l'invariant #12 qui
  surface immédiatement le drift MV vs PG function.

---

## 3. Architecture

```
┌───────────────────────────────┐
│  compute_payment_by_category  │  ← PG function (SQL pure)
│  (year, month)                │     UNIQUE source de vérité
└──────────┬──────────────┬─────┘
           │              │
           │              │
    CREATE MV         live path
    (cache)           (fallback)
           │              │
           ▼              ▼
  ┌────────────────┐  ┌──────────────────────────────┐
  │ monthly_       │  │ src/lib/billing/              │
  │ revenue_mv     │  │ monthly-revenue.ts            │
  └────────┬───────┘  │  getMonthlyRevenueByCategory  │
           │          └──────────┬───────────────────┘
           │                     │
           │                     │  ESLint rule
           │                     │  no-direct-revenue-
           │                     │  computation
           │                     │
           ▼                     ▼
  ┌─────────────────────────────────────────────┐
  │ Consommateurs : dashboard / analytics /     │
  │ billing / invariants horaires / CSV         │
  └─────────────────────────────────────────────┘
```

**Fraîcheur MV** : cron `/api/cron/refresh-monthly-revenue` (horaire)
fait `REFRESH CONCURRENTLY` puis stamp Redis `mv:last_refresh:monthly_revenue_mv`
**uniquement en cas de succès**. Le helper TS lit ce stamp : si < 2h →
fast path MV + drift check async via `waitUntil()` ; si > 2h ou absent →
slow path live + alert sync sur drift.

**Invariants horaires de garde** :
- `#11 payment_attribution_drift` — `SUM(Payment current month) == SUM(MV current month)` (tolérance 0.01 MAD)
- `#12 revenue_helper_vs_live` — `MV(year, month) == compute_payment_by_category(year, month)` par catégorie

Tout drift critical → SMS SUPERADMIN (dedup 24h) + ActionLog
`INVARIANT_VIOLATION_DETECTED`.

---

## 4. Procédure de déploiement (réalisée 2026-05-17)

1. **Étape 0 (hors-tx, manuel)** :
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv;
   ```
   Sert de point de comparaison frais pour l'archive.

2. **Étape 1 (migration SQL)** :
   ```bash
   node scripts/db-migrate.mjs  # applique 20260517_revenue_mv_semantic_b
   ```
   Crée l'archive `monthly_revenue_mv_v1_archive_20260517` (RENAME), la
   PG function, la nouvelle MV, les index, stamp `_app_migrations`.

3. **Étape 2 (rapport d'impact)** :
   ```bash
   node scripts/semantic-b-impact-report.mjs
   ```
   Génère `docs/SEMANTIC_B_MIGRATION_IMPACT.md` avec le diff par mois.
   À envoyer au comptable pour validation.

4. **Étape 3 (vérification)** :
   - Visiter `/admin/health` → invariants #11 #12 verts (count = 0)
   - Visiter `/admin/guardian/invariants` → idem
   - Vérifier 3 cas pivots prod (Anas, Benjamin, Rita) sur le dashboard

5. **Étape 4 (cleanup, à J+30)** :
   ```sql
   DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv_v1_archive_20260517;
   ```

---

## 5. Rollback (30 s)

Voir bloc commenté en bas de
`prisma/migrations/20260517_revenue_mv_semantic_b/migration.sql`. Résumé :

```sql
BEGIN;
DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;
ALTER MATERIALIZED VIEW monthly_revenue_mv_v1_archive_20260517
  RENAME TO monthly_revenue_mv;
DROP FUNCTION IF EXISTS compute_payment_by_category(INT, INT);
DELETE FROM "_app_migrations" WHERE name = '20260517_revenue_mv_semantic_b';
COMMIT;
```

L'archive est conservée 30 jours pour permettre ce rollback. Aucun
changement de schema applicatif (pas de colonne ajoutée à `Payment`
ou `InvoiceItem`) → rollback purement structurel, jamais une perte de
données.

---

## 6. Cas pivots prod (test régression hardcodé)

Verrouillés dans `src/lib/__tests__/business-regression.test.ts §1`,
bloquants en CI :

| Facture | Sémantique A | Sémantique B |
|---|---|---|
| Anas Chekroun DU-2026-0023 (résa avril, payé mai) | 100% mai | **100% mai** ✓ |
| Benjamin Boksenbaum DU-2026-0033 (résa avril, payé mai) | 100% mai | **100% mai** ✓ |
| Imane Berrada DU-2026-0028 (résa+payée avril) | 100% avril | **100% avril** ✓ |
| Rita Kabbaj DU-2026-0030 (900 avril + 40 mai) | 100% mai | **900 avril + 40 mai** ✓ |
| Alexandra Bon DU-2026-0024 (1000 avril + 940 mai) | 100% mai | **1000 avril + 940 mai** ✓ |
| Marie Lagarde DU-2026-0052 (CANCELLED, paid=0) | 0 CA | **0 CA** ✓ |

Tout changement futur de la formule → ces tests cassent → la PR ne merge
pas.

---

## 7. Liens

- Migration : `prisma/migrations/20260517_revenue_mv_semantic_b/`
- Helper canonique : `src/lib/billing/monthly-revenue.ts`
- ESLint rule : `eslint-rules/rules/no-direct-revenue-computation.js`
- Invariants : `src/lib/health-invariants.ts` (#11 #12)
- Crons refresh : `src/app/api/cron/refresh-monthly-revenue/route.ts` + `refresh-revenue-mv/route.ts`
- Script impact : `scripts/semantic-b-impact-report.mjs`
- Doc règles métier : `docs/BUSINESS_RULES.md` §1
