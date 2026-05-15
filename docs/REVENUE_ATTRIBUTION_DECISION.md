# Décision — Attribution des paiements aux catégories de service

**Statut :** ✅ ACTIVE depuis 2026-05-15 (Sémantique A + A1 retenues)
**Auteur :** Claude (audit 2026-05-15 sur facture DU-2026-0030 Kabbaj Rita)
**Validation :** Mehdi 2026-05-15 — A1 (acceptation bougement chiffres passés, aucun CA ventilé jamais transmis au comptable)
**Implémentation :** voir `src/lib/accounting.ts` (commentaire d'en-tête) +
`prisma/migrations/20260515_revenue_mv_semantic_a/` + tests
`src/lib/__tests__/billing.test.ts` (régression Rita figée).
**Impact :** comptable + déclaratif fisc Maroc + KPIs `/admin/dashboard` + `/admin/analytics`

---

## 1. Cas reproductible — DU-2026-0030 (Kabbaj Rita)

### Données

**InvoiceItems** (ordre `id asc` = ordre de création) :

| # | Item | Total MAD | category |
|---|---|---:|---|
| 0 | Pension Mamy (chien) | 840.00 | OTHER |
| 1 | Toilettage Mamy (petit) | 100.00 | GROOMING |

**Payments** (triés par `paymentDate asc`) :

| # | Date | Montant | Méthode |
|---|---|---:|---|
| 0 | 29/04/2026 | 900.00 MAD | CASH (acompte au dépôt) |
| 1 | 06/05/2026 | 40.00 MAD | CASH (solde au retrait) |

**Total facturé = 940 MAD. Total encaissé = 940 MAD. Statut : PAID.**

### Que voit Mehdi sur `/admin/dashboard` ?

> "Détail Toilettage : 40 MAD encaissés en mai" — alors que le toilettage (100 MAD) a été intégralement réglé.

---

## 2. Cause racine architecturale

**`Payment` n'a aucun lien vers `InvoiceItem`.** Pas de `lineItemId`, pas de table d'allocation. Donc tout calcul "encaissé par catégorie ce mois" repose sur une CONVENTION d'allocation choisie unilatéralement par le code, sans trace en DB.

### Pire : le projet a déjà DEUX conventions différentes en parallèle

| Endroit | Algorithme | Résultat sur Rita en mai |
|---|---|---:|
| `src/lib/accounting.ts` → `computeMonthlyRevenueByCategory` | **FIFO séquentiel** (Payment date asc, Item id asc) | Toilettage = **40.00** |
| `src/lib/accounting.ts` → `allocateBetweenItems` (drill-down Analytics) | Idem FIFO séquentiel | Toilettage = **40.00** |
| `prisma/migrations/20260509_monthly_revenue_mv` → `monthly_revenue_mv` | **Pro-rata par item** (`item.total × payment.amount / invoice.amount`) | Toilettage = **4.26** |

`metrics.ts` lit en priorité `monthly_revenue_mv` (pré-agrégé) avec fallback live sur la fonction JS. **Selon que la MV ait été refresh ou pas pour le mois courant, Mehdi voit 4.26 OU 40 MAD pour le même fait financier.** C'est la racine du non-déterminisme.

### Trace du calcul FIFO actuel sur Rita

```
itemRemaining = [840 (Pension), 100 (Toilettage)]
itemIdx = 0

Payment 1 (900 MAD, 29/04 — PAS dans mai):
  isThisMonth = false
  → consume 840 of slot[0] (Pension): itemRemaining[0] = 0, itemIdx = 1
  → consume 60 of slot[1] (Toilettage): itemRemaining[1] = 40
  → no result update (date hors mois cible)

Payment 2 (40 MAD, 06/05 — DANS mai):
  isThisMonth = true
  → consume 40 of slot[1] (Toilettage): itemRemaining[1] = 0
  → result['grooming'] += 40
```

**Le 40 MAD est attribué à Toilettage purement parce que :**
1. Le payment d'avril a "consommé" 840 MAD de Pension + 60 MAD de Toilettage en cumulant FIFO
2. Au moment du payment de mai, l'item "courant" dans la file FIFO était Toilettage avec 40 MAD restants

**Si l'admin avait inversé l'ordre de saisie** (Toilettage avant Pension), le résultat aurait été :
```
Payment 1 (900, avril): consume Toilettage 100 + Pension 800
Payment 2 (40, mai): consume Pension 40 → result['other'] += 40
```
→ "0 MAD Toilettage en mai, 40 MAD Other en mai"

**Même réalité financière, deux résultats différents selon l'ordre de création des items en DB.** Voilà l'arbitrarité.

---

## 3. Trois sémantiques candidates

### Sémantique A — "Encaissé du mois = facture clôturée ce mois"

> "Une facture intégralement payée bascule en CA le jour de son dernier payment, par item à 100% de son `total`."

**Règle de calcul** :
- Si `Invoice.status = PAID` ET `lastPayment.paymentDate ∈ [monthStart, monthEnd]` :
  - Pour chaque item : ajouter `item.total` au bucket de sa catégorie (ce mois)
- Si la facture n'est pas encore PAID : 0 contribution (acompte = pas encore CA réparti)
- Pour les `PARTIALLY_PAID` non clôturées : exclues des KPIs encaissés (cohérent avec "caisse close" comptable)

**Résultat Rita en mai** : Pension 840 + Toilettage 100 = **940 MAD basculés intégralement en mai** (mois de la dernière encaisse). Avril = 0.

**Avantages** :
- Déterministe, indépendant de l'ordre de saisie
- Comptablement défendable : on enregistre la vente quand elle est intégralement payée
- 1 facture = 1 mois → simple à expliquer au comptable
- Pas de migration DB requise

**Inconvénients** :
- Brutal pour les longs séjours qui se règlent à cheval sur 2 mois : tout bascule sur le mois du paiement final
- Acompte de 900 MAD en avril ne génère AUCUN CA avril dans le détail par catégorie (mais reste visible dans "encaissé brut" via Payment direct)
- `PARTIALLY_PAID` masquent le CA en cours (peuvent être réglées 3 mois plus tard, distort la saisonnalité observée)

### Sémantique B — "Encaissé du mois = pro-rata par item du payment du mois"

> "Chaque payment est ventilé prorata sur tous les items de la facture selon leur poids `item.total / invoice.amount`."

**Règle de calcul** : c'est ce que fait déjà `monthly_revenue_mv` aujourd'hui.

**Résultat Rita en mai** : Toilettage = 40 × 100/940 = **4.26 MAD**, Pension = 40 × 840/940 = **35.74 MAD**.

**Avantages** :
- Lisse les revenus dans le temps (chaque payment contribue à toutes les catégories)
- Symétrique : si les items ont les mêmes poids, l'attribution est équitable
- Implémentable en SQL pur (déjà dans la MV)

**Inconvénients** :
- Produit des **centimes fractionnaires** difficiles à expliquer ("Toilettage = 4.26 MAD ce mois ?")
- N'a aucun sens métier réel : Mehdi ne pense pas "j'ai encaissé 4.26 de toilettage" — il pense "le toilettage est fait, payé, point"
- Sensible aux arrondis (déjà tronqué à `numeric(14,2)` côté MV → drift Σ items ≠ Σ payments si beaucoup de ratios)

### Sémantique C — "Encaissé du mois = allocation strictement modélisée"

> "Une nouvelle table `PaymentAllocation { paymentId, lineItemId, amount }` capture l'attribution explicite faite par l'utilisateur ou par défaut FIFO, et tous les calculs lisent cette table."

**Règle de calcul** :
- Migration : créer `PaymentAllocation`, backfill avec FIFO sur 10 ans de données
- À chaque nouveau payment : créer N rows d'allocation (UI ou défaut FIFO)
- Tous les KPIs lisent les rows d'allocation, pas une formule à la volée

**Résultat Rita en mai** : dépend de l'allocation effectuée à la saisie. Si Mehdi décide "le payment de mai paie Toilettage", c'est explicite et stocké → 100 MAD Toilettage en mai. S'il dit "ça paie le solde Pension", c'est 40 MAD Other en mai.

**Avantages** :
- Précis comptablement (exact à l'unité)
- Auditable (qui a alloué quoi quand)
- Permet des allocations métier complexes (avoirs, remises ciblées, splits manuels)

**Inconvénients** :
- Migration DB importante : nouvelle table + colonnes, backfill irréversible
- Charge cognitive UI : Mehdi doit allouer chaque payment → friction sur le flow caisse
- Complexité de tous les `PaymentModal` à augmenter (ou un défaut FIFO s'il skip → on retombe dans le problème actuel)
- Refacto de toutes les routes payment + allocateBetweenItems + computeMonthlyRevenueByCategory + MV
- Coût élevé (estimation 3-5 jours de dev + tests)

---

## 4. Recommandation argumentée

**👉 Sémantique A.**

**Pourquoi A et pas B :**
- B produit des centimes fractionnaires impossibles à défendre devant le comptable
- B est le statu quo de la MV → Mehdi voit déjà des chiffres bizarres ("4.26 grooming" en silence)
- B n'a aucune réalité métier : un toilettage est fait OU pas, payé OU pas

**Pourquoi A et pas C :**
- L'effort C ne se justifie pas à l'échelle 500 clients / 1 facture/jour
- L'allocation explicite ajoute une étape UI à un flow déjà chargé pour Mehdi solo
- Le gain de précision est inutile pour un usage interne (KPIs + déclaratif). Si jamais le fisc demande un contrôle, A produit une justification simple et défendable

**Pourquoi A est défendable au comptable / fisc :**
- Marocain : la TVA est calculée à l'encaissement (régime simplifié). Bascule complète au dernier payment = aligné avec le fait générateur fiscal
- Une facture = un événement comptable atomique. Pas de fractionnement partiel
- Si Mehdi est jamais audité, la phrase à dire est : "Le CA par catégorie correspond aux factures clôturées ce mois". Court, simple, testable.

---

## 5. Plan de patch (si A validé)

### Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/lib/accounting.ts` | Réécrire `computeMonthlyRevenueByCategory` — pour chaque facture, si `lastPayment.date ∈ [monthStart, monthEnd]` → ajouter `item.total` par catégorie ; sinon 0 |
| `src/lib/accounting.ts` | Réécrire `allocateBetweenItems` (drill-down Analytics) — même logique : item à 100% si la facture est clôturée ce mois |
| `prisma/migrations/20260515_revenue_mv_rewrite/migration.sql` | Nouvelle migration : `DROP MATERIALIZED VIEW monthly_revenue_mv` + CREATE avec la nouvelle sémantique (joindre sur `MAX(p.paymentDate) PER invoice` puis filtrer par mois) |
| `src/lib/metrics.ts` | Vérifier que `revenueByCategoryProrata` lit bien la nouvelle MV. Renommer en `revenueByCategoryClosed` pour éviter la confusion (l'ancien nom suggère "prorata") |
| `src/lib/__tests__/billing.test.ts` | Adapter les tests existants à la nouvelle sémantique |
| `src/lib/__tests__/billing.test.ts` | **AJOUTER un test régression Rita** : reproduire DU-2026-0030 et asserter que pour mai, `grooming = 100` (pas 40, pas 4.26). Asserter aussi que pour avril, `grooming = 0`. |
| `src/app/[locale]/admin/dashboard/page.tsx` | Aucun changement : appelle `billedByCategory` qui re-route automatiquement |
| `src/app/[locale]/admin/analytics/page.tsx` | Aucun changement structurel ; vérifier que le drill-down par item est cohérent avec la nouvelle MV |
| `docs/SCHEMA.md` | Documenter la sémantique A en haut de la section "Comptabilité" |

### Migration des données existantes

**Aucune.** A ne change pas la structure DB. Les KPIs des mois passés vont **bouger** au prochain refresh de la MV — voir §6.

### Tests

- Test régression Rita (cas réel) — fige la sémantique
- Tests existants `billing.test.ts` à adapter (les valeurs attendues changent)
- Test "facture PARTIALLY_PAID exclue" — vérifie qu'une facture pas encore close ne pollue pas le KPI
- Test "long séjour avril → mai, payé en juin" → tout en juin, 0 en avril/mai

### CI

`migration-rollback-check.yml` exigera un `down.sql` qui restaure l'ancienne MV. Marker `@rollback: not-applicable` si on accepte qu'un rollback ramène les anciens KPIs (cohérent avec le rollback de l'application).

---

## 6. Impact sur les chiffres passés (CRITIQUE — à valider explicitement)

**Si on bascule sur la sémantique A, les chiffres CA mensuels par catégorie des 10 dernières années VONT BOUGER au prochain refresh de la MV.**

Exemples d'impact :
- Une facture payée à cheval sur 2 mois bascule entièrement sur le 2ème mois → le 1er mois perd ce CA, le 2ème en gagne le total
- Les `PARTIALLY_PAID` sortent des KPIs "encaissé" tant qu'elles ne sont pas closes → certains mois auront moins de CA visible
- Le total annuel reste **identique** (le CA est juste re-réparti dans le temps)

**Trois stratégies possibles** :

**A1 — Acceptation pure** : on refresh, les chiffres bougent, on documente. Risque : Mehdi a peut-être déjà déclaré certains CA mensuels au comptable basés sur l'ancienne sémantique. Si oui, divergence cumulative défendable mais inconfortable.

**A2 — Snapshot mensuel figé** : pour chaque mois clos (ex: mois M-2 et antérieurs), on snapshot la valeur actuelle dans une table `MonthlyRevenueArchive { year, month, category, total, frozenAt }`. Les KPIs lisent l'archive pour le passé, le calcul live pour le mois courant et M-1. Plus complexe mais préserve l'historique déclaré.

**A3 — Migration progressive** : la nouvelle sémantique ne s'applique qu'aux factures créées à partir d'une date pivot (ex: 2026-06-01). Les factures antérieures gardent leur calcul actuel via un flag. Plus de complexité long terme mais zéro impact sur le passé.

**👉 Recommandation : A1 si pas de déclaration faite, A2 sinon.**

À toi de me dire :
- Est-ce que tu as déjà transmis au comptable des CA mensuels par catégorie sur 2025/2026 ?
- Si oui, sur quelle période ? On bascule sur A2 sur cette période.
- Si non, on fait A1 et c'est plus simple.

---

## 7. Endroits qui font le même type d'agrégation (cohérence)

Pour assurer qu'**aucun** dashboard n'utilise une autre formule en parallèle :

| Endroit | Source | Action |
|---|---|---|
| `/admin/dashboard` "Détail par service" | `billedByCategory` → MV | ✓ basculé automatiquement |
| `/admin/analytics` "Performance par activité" | `billedByCategory` → MV | ✓ basculé automatiquement |
| `/admin/analytics` drill-down items | `allocateBetweenItems` (JS) | ⚠️ à réécrire pour cohérence avec A |
| `/admin/billing` mois courant | `getMonthlyInvoicesWhere` (filtre, pas allocation) | ✓ pas de changement requis |
| `/api/admin/invoices/export` CSV | `getMonthlyInvoicesWhere` (filtre) | ✓ pas de changement requis |
| Cron `refresh-monthly-revenue` | `monthly_revenue_mv` | ✓ basculé automatiquement |
| Tests `billing.test.ts` | `computeMonthlyRevenueByCategory` (JS) | ⚠️ à adapter |

---

## 8. Ce que j'attends de toi

1. **Confirmes-tu la sémantique A ?** (ou demandes-tu B ou C avec une raison)
2. **As-tu déjà transmis des CA mensuels par catégorie au comptable ?** (détermine A1 vs A2)
3. **Y a-t-il un scénario métier qu'aucune des trois sémantiques ne couvre ?** (ex: avoir partiel, remise rétroactive)
4. **OK pour figer la régression sur le cas Rita comme test canonique ?** (oui par défaut)

Une fois validé, je code en une PR atomique, format Constat | Cause | Patch | Risks | Verify, avec tests + migration + commentaires en haut de chaque endpoint touché.
