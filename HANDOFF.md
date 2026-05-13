# HANDOFF.md

> État du projet à la fin de la session 2026-05-13.
> Document de passage rapide : ce qui est mergé, ce qui attend, ce qu'il faut faire avant déploiement.

---

## TL;DR — actions urgentes pour la prochaine session

1. **Upstash Redis** : ~750-950K cmds/mois estimées vs 500K free tier. Voir `AUDIT_REDIS.md` pour le plan de réduction (quick wins R1+R2a+R4 = −580K cmds). Solution rapide alternative : upgrade Pay-as-you-go (~$0.20/100K cmds).
2. **Migrations Supabase à exécuter manuellement** (PR mergées mais SQL pas appliqué) :
   - `prisma/migrations/20260513_product_catalog_fields/migration.sql` (PR #51)
   - `prisma/migrations/20260513_booking_item_product/migration.sql` (PR #52)
3. **PR #52 en cours** (`claude/booking-items-ui`) : attend que CI repasse au vert après les 2 derniers fix (`9e114f9` mock `$transaction`, `7bd3a4f` diagnostics SmsLog).

---

## PRs ouvertes / mergées cette session

| PR | Branche | État | Sujet |
|---|---|---|---|
| #46 | `claude/disable-panel-fix-bugs` | ✅ merged | Désactivation side panel + fix doublon KPI + unification compteur "présents" |
| #47 | `claude/decouple-walkin-controls` | ✅ merged | Découplage 3 contrôles walk-in (client / open-ended / status) — 6 combinaisons |
| #48 | `claude/fix-dashboard-no-invoice-counter` | ✅ merged | Compteur "sans facture" filtré COMPLETED only + filtre URL `?noInvoice=1` |
| #49 | `claude/dashboard-actionable-kpi-lists` | ✅ merged | KPI dashboard transformés en mini-listes cliquables top 3 |
| #50 | `claude/fix-provisional-pricing` | ✅ merged | Prix provisoire live pour walk-ins ouverts (Jon biw 0 → 3120 MAD) |
| #51 | `claude/products-catalog` | ✅ merged | Catalogue Produits — description/costPrice/lowStock/archive + optimistic lock |
| #52 | `claude/booking-items-ui` | 🟡 **en cours** | Produits & Extras sur fiche résa — BookingItem CRUD + facture compl. |

Ouvert également : branche `claude/audit-redis-consumption` avec `AUDIT_REDIS.md` (à ne PAS merger — read-only audit pour référence).

---

## Migrations Supabase à exécuter (ordre indifférent, idempotentes)

### 1. `20260513_product_catalog_fields` (PR #51 mergée)

```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description"        TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice"          DECIMAL(10, 2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lowStockThreshold"  INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isArchived"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "version"            INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Product_isArchived_idx" ON "Product"("isArchived");
```

### 2. `20260513_booking_item_product` (PR #52, à exécuter après le merge)

Voir le fichier source. Contenu :
- `BookingItem.productId` + FK Product + index
- `BookingItem.invoiceItemId` + FK InvoiceItem + index
- `ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'EXTRA_SERVICE'`
- `ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'MISC_FEE'`

⚠️ Si Postgres refuse `ALTER TYPE ... ADD VALUE` dans la même transaction que les ALTER TABLE, exécuter les 2 `ALTER TYPE` séparément (un Run dédié chacun).

---

## État Vercel / CI

- **Vercel preview** : passe sur les 7 PRs (vu manuellement)
- **TypeScript** : passe sur main. PR #52 attend la passe de CI après `9e114f9` (correction du type `$transaction` mock dans `admin-booking-items.test.ts`).
- **Tests Vitest** : passe sur main + PR #52 après `7bd3a4f` (fix `diagnostics.test` qui mockait l'ancien `actionLog.findFirst` au lieu du nouveau `smsLog.findFirst` + BullMQ `getCompleted`).
- **Migration Rollback Check** : ROUGE pré-existant (lié à `20260511_invoice_sequence`, séquence Postgres qui dépend de la table Invoice). N'affecte pas prod. Documenté dans CLAUDE.md section "DETTE TECHNIQUE".
- **Security Audit** : ROUGE pré-existant (npm audit issues hors scope).

---

## Architecture clés établies cette session

- **`src/lib/live-pricing.ts`** (PR #50) — helper pur `computeLiveTotal({ pets, startDate, addons?, unbilledItemsTotal? }, pricing, now)`. Source unique de vérité pour le prix provisoire des walk-ins ouverts. Inclut désormais les addons (taxi, grooming) ET la somme des BookingItem non-facturés (PR #52).
- **`DashboardKpiList`** (PR #49) — composant réutilisable pour transformer un compteur KPI en mini-liste cliquable top 3 + bouton "Voir tout".
- **Workflow archive Product** (PR #51) — DELETE legacy reroutée vers archive ; les produits avec vente historique ne sont jamais hard-delete. Optimistic locking via `Product.version`.
- **Workflow BookingItem** (PR #52) — staging pré-facture pour produits + lignes libres (EXTRA_SERVICE / MISC_FEE / DISCOUNT). Génère facture complémentaire pour items ajoutés après clôture. Coexiste avec l'ancien flow `AddProductSection` (sur InvoiceItem).

---

## Choix produit notables

- **Side panel `?booking=`** : désactivé en prod, fichiers conservés sur disque pour réactivation future propre (PR #46).
- **3 contrôles walk-in indépendants** : `walkInClient`, `isOpenEnded`, `initialStatus` traités séparément. `isWalkInClient` (notifications + idempotency) vs `isWalkInBooking` (drapeau DB) (PR #47).
- **Tarifs corrompus sur résa legacy** : `getPensionPriceNumber` + Setting sont la source unique. PR #50 calcule en live à l'affichage, sans toucher la DB.
- **Compteur "sans facture"** : restreint à `status=COMPLETED` (seul signal actionnable — CONFIRMED/IN_PROGRESS sans facture est normal) (PR #48).

---

## Dette technique signalée

1. **Migration Rollback Check CI** rouge sur `20260511_invoice_sequence` — voir CLAUDE.md.
2. **Upstash Redis** quota — voir `AUDIT_REDIS.md`.
3. **PR #52 — flow ancien `AddProductSection` (InvoiceItem) coexiste avec le nouveau (BookingItem)**. À unifier dans une PR dédiée plus tard ; ne pas faire d'urgence puisque les 2 flows ne se marchent pas dessus.
4. **`computeLiveTotal` `unbilledItemsTotal`** — paramètre optionnel ajouté en PR #52 mais aucun appelant ne le passe encore. La page détail réservation calcule son propre live total séparément. À unifier quand le besoin se manifeste.

---

## Comment reprendre rapidement

1. `git pull --all && git checkout claude/booking-items-ui`
2. Vérifier la CI sur https://github.com/Archsider/dog-universe/pull/52
3. Si vert → merge → exécuter la migration `20260513_booking_item_product` sur Supabase
4. Reprendre la session avec le prompt qui suit dans la liste (intégration produits côté client / panier / etc. — la roadmap est dans les commentaires des PRs)

---

**Dernier commit `main` :** `654c23a` (Merge PR #51).
**Dernier commit branche active :** `7bd3a4f` (claude/booking-items-ui).
