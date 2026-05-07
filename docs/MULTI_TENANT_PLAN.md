# Multi-tenant — Plan de migration

## Contexte

Dog Universe est aujourd'hui **single-tenant** : une seule pension (Maroc),
toutes les rows User/Booking/Invoice/Pet appartiennent implicitement au même
business. Pour évoluer vers un SaaS multi-pension (plusieurs gérants, chacun
avec ses clients/animaux/réservations), il faut introduire un `tenantId` sur
les tables d'entités, et l'enforcer dans toutes les requêtes.

Ce doc décrit la migration en 4 phases **non-bloquantes**, chacune
indépendante et déployable en isolation.

## État actuel (scaffolding posé — 2026-05-07)

- Table `Tenant` créée avec une row `'default'` (`prisma/migrations/20260510_tenant_scaffold/migration.sql`)
- Modèle Prisma `Tenant` dans `schema.prisma` (sans relation forcée)
- Helpers dans `src/lib/tenant.ts` :
  - `getCurrentTenantId()` → `process.env.DEFAULT_TENANT_ID ?? 'default'`
  - `tenantWhere()` → `{}` tant que `MULTI_TENANT_ENABLED` ≠ `'true'`
- **Aucun comportement runtime modifié** — toutes les requêtes existantes
  fonctionnent à l'identique.

## Phase 1 — Add `tenantId` optional (1 jour)

Ajouter `tenantId String?` (nullable, sans FK forcée) sur les tables :

- `User` (clients + admins)
- `Pet`
- `Booking`
- `Invoice`
- `LoyaltyGrade`
- `LoyaltyBenefitClaim`
- `Notification`
- `AdminNote`
- `ActionLog`
- `ClientContract`
- `StayPhoto`
- `Review`
- `Payment` (via Invoice)
- `MonthlyRevenueSummary`
- `Setting` (capacité par tenant !)

Migration : `ALTER TABLE ... ADD COLUMN "tenantId" TEXT NULL;`

**Aucun code modifié à cette phase** — la colonne existe mais reste nulle.

## Phase 2 — Backfill (1/2 jour)

Script SQL one-shot :

```sql
UPDATE "User" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Pet" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
-- ... etc pour chaque table
```

À exécuter en dehors d'une fenêtre de prod chargée. Idempotent.

Vérification :

```sql
SELECT COUNT(*) FROM "User" WHERE "tenantId" IS NULL;
-- doit être 0
```

## Phase 3 — Make required + FK (1 jour)

Migration :

```sql
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
```

Schema Prisma : ajouter `tenant Tenant @relation(...)` sur chaque modèle.

Code : `tx.user.create({ data: { ..., tenantId: getCurrentTenantId() } })` sur
**tous les call sites de création**. Le scaffolding `tenantWhere()` est
toujours noop tant que le flag n'est pas activé.

## Phase 4 — Enforce dans middleware + queries (2 jours)

1. Middleware Next.js : extraire le tenant depuis le subdomain ou un header
   custom (`x-tenant-id`), le passer dans la session JWT.
2. `getCurrentTenantId()` lit la session (via `auth()`) plutôt que l'env.
3. `MULTI_TENANT_ENABLED=true` → `tenantWhere()` injecte le filtre partout.
4. **Audit obligatoire** : grep `prisma.{user,booking,invoice,pet}` →
   chaque `findMany/findFirst` doit avoir `...tenantWhere()` dans le `where`.
5. Tests E2E : créer 2 tenants, vérifier qu'un admin de tenant A ne voit
   jamais les bookings du tenant B.

## Tables à toucher (récap)

| Catégorie | Tables |
|---|---|
| Entités utilisateur | `User`, `Pet` |
| Réservations | `Booking`, `BookingItem`, `BoardingDetail`, `TaxiDetail`, `TaxiTrip` |
| Comptabilité | `Invoice`, `InvoiceItem`, `Payment`, `MonthlyRevenueSummary` |
| Fidélité | `LoyaltyGrade`, `LoyaltyBenefitClaim` |
| Communication | `Notification`, `AdminNote`, `Review` |
| Documents | `ClientContract`, `StayPhoto` |
| Système | `Setting`, `ActionLog`, `AuditLog` |

`Product` peut rester global (catalogue partagé) ou par tenant — décision
business à confirmer.

## Effort estimé

- **3-5 jours** pour un dev senior connaissant le codebase.
- **+2 jours** pour le testing E2E exhaustif (cross-tenant leakage).
- **+1 jour** pour la doc d'onboarding admin (créer un tenant, inviter le
  premier SUPERADMIN, configurer Stripe par tenant si applicable).

## Risques

- **Cross-tenant leakage** : un seul `findMany` qui oublie `tenantWhere()`
  expose les données d'un tenant à un autre. Mitigation : audit grep + tests
  E2E + `tenantWhere()` injecté dans les helpers communs (`src/lib/services/*`).
- **Sentry / logs** : ne pas logger le tenantId en clair dans les events
  publics (ID interne acceptable, slug non).
- **Cache Redis** : toutes les clés cache (`CacheKeys.*`) doivent être
  préfixées du tenantId. Sinon contamination.
