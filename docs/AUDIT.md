# AUDIT — Dog Universe

**Version auditée** : branche `main` (commit `90f1a1b`) + feature branch `claude/regex-implementation-W9bVx` (commit `37dcb1f`)
**Date** : 2026-05-11
**Stack** : Next.js 15 App Router · Prisma 5 · PostgreSQL (Supabase) · NextAuth 5 beta · next-intl 4 · BullMQ · Upstash Redis · Vercel

---

## Scoring rapide (pour LLM reviewer)

| Dimension | Score | Justification courte |
|---|---|---|
| **Sécurité** | 8.5 / 10 | Auth, TOTP 2FA, rate-limit 9 buckets, HMAC webhooks, XSS email échappé, RGPD — quelques routes API sans Zod |
| **Qualité du code** | 7.5 / 10 | TS strict + 0 erreurs, conventions solides, mais 4 god-files > 1000 lignes sur main (corrigés sur feature branch) |
| **Tests** | 7 / 10 | 649 tests unitaires / intégration, 8 specs E2E, mutation testing Stryker — pas de load tests déployés |
| **Architecture** | 8 / 10 | App Router RSC-first, service layer extrait, caching multi-couche, feature flags — quelques lib files > 400 lignes |
| **Observabilité** | 9 / 10 | Sentry (3 surfaces), structured logging, health page, status page publique, AI Guardian, heartbeat */5min |
| **Base de données** | 8.5 / 10 | 34 modèles, 65 indexes, 19 colonnes Decimal, soft-delete sur 85 fichiers, 84 migrations versionnées + rollback |
| **DevOps / CI** | 8 / 10 | 5 workflows CI, migration check + rollback CI, Vercel déploiement, 15 crons, lockfile — pas de staging env visible |
| **Documentation** | 9 / 10 | CLAUDE.md exhaustif, 18 docs techniques, RUNBOOK.md incidents, SCHEMA.md auto-généré, HISTORY.md décisions |
| **Performance** | 7.5 / 10 | Redis cache 5 niveaux, unstable_cache RSC, MV analytics, indexes composites — pas de Lighthouse CI actif |
| **Internationalisation** | 8 / 10 | 3 locales (fr/en/ar) via next-intl, RTL arabe, templates email bilingues — traductions AR potentiellement incomplètes |

**Score global estimé : 8.1 / 10**

---

## 1. Sécurité

### Authentification et autorisation
- **NextAuth 5** (JWT) avec `tokenVersion` invalidation sur password change — révocation immédiate des sessions
- **2FA TOTP obligatoire** pour ADMIN/SUPERADMIN : setup/disable exigent re-auth password + token courant ; replay protection 90 s via `lastTotpToken + lastTotpUsedAt` ; secrets chiffrés AES-256-GCM (`TOTP_ENCRYPTION_KEY`)
- **Middleware bypass corrigé** : `/api/admin/*` sans token TOTP valide → 403 `TOTP_REQUIRED`
- **FK Restrict** sur `Booking.clientId`, `Invoice.clientId`, `LoyaltyGrade.clientId` — empêche hard-delete accidentel

### Rate limiting
9 buckets Upstash composites IP+userId (authentifié → `u:userId`, anonyme → IP) :

| Bucket | Limite | Routes |
|---|---|---|
| `auth` | 10 / 15 min | signin, register, callback |
| `passwordReset` | 5 / 60 min | reset-password, profile/password |
| `bookings` | 20 / 60 min | POST /api/bookings |
| `uploads` | 30 / 60 min | uploads, contracts, vaccinations |
| `adminMutation` | 300 / 60 min | tout /api/admin/* mutating |
| `taxiStream` | 60 / 60 min | GET taxi SSE |
| `rgpd` | 5 / 60 min | export, anonymize |
| `addonRequest` | 10 / 60 min | POST addon-request |
| `vaccinationExtract` | 10 / 60 min | extraction AI doc |

### Surface API (119 routes)
- 90 routes avec auth check (`auth()` / `getServerSession`)
- 29 routes intentionnellement publiques : 14 crons (header `x-cron-secret`), 4 health/ping, auth callbacks, register, webhook Sentry (HMAC SHA-256), tracking taxi (token opaque)
- **Faiblesses identifiées** : ~15 routes utilisent validation partielle (pas de Zod schema complet) ; les routes legacy `/api/bookings` passent par `withSchema` mais certains PATCH handlers ont des whitelist à durcir

### Données et RGPD
- Soft-delete (User + Pet) au lieu de hard-delete — 85 fichiers avec filtre `deletedAt: null`
- `POST /api/user/anonymize` efface les PII en gardant les FK comptables
- `GET /api/user/export` exporte JSON des données personnelles
- Sentry : `sendDefaultPii: false` + `beforeSend` filtre email/IP/cookie/auth header
- PII exclus des prompts Anthropic (règle RGPD dans CLAUDE.md)

### Stockage sécurisé
- 2 buckets Supabase : `uploads` (public, photos) / `uploads-private` (privé, contrats PDF)
- Contrats retournés via signed URL (1h max) — jamais exposés publiquement
- Magic bytes MIME validation côté serveur (JPEG, PNG, WebP, GIF, PDF)

---

## 2. Qualité du code

### Métriques
- **TypeScript** : 0 erreurs (`tsc --noEmit` clean sur toutes branches)
- **Conventions** : variables/fonctions en anglais, UI fr/en/ar, Server Components par défaut, `'use client'` uniquement si interactif
- **Formatage monétaire** : `formatMAD()` sur 100% des affichages prix (pas de hard-code)
- **Decimal** : 19 colonnes `@db.Decimal(10,2)` — précision exacte au centime

### God-files (principale faiblesse sur `main`)
| Fichier | Lignes | Statut |
|---|---|---|
| `client/bookings/new/page.tsx` | 1 227 | Découpé sur feature branch (→ 243 + 16 sous-fichiers) |
| `admin/board/BoardView.tsx` | 1 121 | Découpé sur feature branch (→ 133 + 15 sous-fichiers) |
| `AdminCreateBookingModal.tsx` | 1 052 | Découpé sur feature branch (→ 302 + 8 sous-fichiers) |
| `InvoiceDetailClient.tsx` | 1 006 | Découpé sur feature branch (→ 125 + 8 sous-fichiers) |

### Lib files > 300 lignes (sur `main`)
| Fichier | Lignes | Concernant |
|---|---|---|
| `notifications.ts` | 662 | Orchestrateur + factories messages (factories extraites dans `notification-messages.ts`) |
| `services/booking-admin.service.ts` | 460 | Façade — logique réelle dans sous-services |
| `metrics.ts` | 426 | Calculs analytics aggrégés |
| `email/shared.ts` | 366 | Templates email complexes |
| `validation.ts` | 356 | Schemas Zod centralisés (acceptable) |

### Patterns positifs
- `withSchema` wrapper Zod unifié pour les routes Next.js 15 (async params)
- `runWithSerializableRetry` pour les transactions Serializable (retry deadlocks)
- `tryAcquireIdempotency` (Stripe pattern) sur POST /api/bookings
- Optimistic concurrency `version` sur `Invoice` et `Booking`
- Service layer extrait (`booking-admin.service.ts`, `booking-client.service.ts`)

---

## 3. Tests

### Coverage
```
Tests  : 649 passing / 0 failing (52 fichiers Vitest)
E2E    : 8 specs Playwright (skip gracieux si secrets absents)
Perf   : 4 scénarios k6 (booking concurrent, dashboard, invoice payment race, taxi heartbeat) — exécution manuelle
Mutation: Stryker configuré — thresholds high=80, low=60, break=50
         — cible : billing.ts, accounting.ts, loyalty.ts, capacity.ts, category.ts
```

### Points forts
- Tests unitaires sur logique critique : pricing, loyalty grades, capacity, geo (haversine), heartbeat, feature flags, AI guardian
- Tests paramétrisés sur les cas-limites pricing (CAT/DOG × nuits × multi-animals)
- API tests : payments, idempotency, capacity, loyalty-claims PATCH, taxi-token, invoice discount (sur feature branch)

### Lacunes
- Coverage global non mesuré (pas de `--coverage` dans CI)
- Mutation testing non exécuté en CI (Stryker = exécution manuelle)
- Load tests k6 hors pipeline PR — aucun baselines de perf en CI
- Tests de rollback migration : CI `migration-rollback-check.yml` couvre les 90 derniers jours

---

## 4. Architecture

### Patterns RSC
- Pages = Server Components par défaut (Prisma direct, 0 waterfall useEffect)
- `*Client.tsx` pour les parties interactives (formulaires, modals, kanban)
- URL state pour wizard multi-étapes (`searchParams` + `router.push`) — bookmarkable

### Caching multi-couche
| Couche | Mécanisme | TTL |
|---|---|---|
| Capacity limits | Redis `cacheReadThrough` | 5 min |
| LoyaltyGrade / user | Redis | 5 min |
| Notif unread count | Redis | 30 s |
| Admin pending counts | `unstable_cache` tag | 30 s |
| Analytics MV | PostgreSQL `monthly_revenue_mv` | Refresh horaire + daily |

### Asynchronisme
- **BullMQ** (TCP Upstash) pour emails + SMS batch (crons)
- **Fire-and-forget direct** (`sendEmailNow`/`sendSmsNow`) pour le transactionnel (actions user)
- Workers éphémères (max 10 jobs/queue, 55 s) — compatible Vercel serverless
- DLQ (Dead Letter Queue) + `/admin/queues` monitoring + retry SUPERADMIN

### Feature flags
DB-backed (`FeatureFlag`), kill-switch + rollout% + targetRoles + whitelist :
- `isFeatureEnabled(key, ctx)` — sticky bucketing SHA-256
- Cache Redis 60 s (négatif aussi caché)
- Hook `useFeatureFlag(key)` côté client
- Page `/admin/feature-flags` (SUPERADMIN)

---

## 5. Observabilité

| Signal | Implémentation |
|---|---|
| Erreurs runtime | Sentry (client + server + edge) — `sendDefaultPii: false` |
| Logs structurés | `src/lib/logger.ts` — JSON `{ level, service, message, timestamp, requestId }` |
| Traces | `withSpan` (Sentry.startSpan) sur routes et crons |
| Crons | `markCronRun` en début/fin → dashboard `/admin/health` |
| Uptime | `Heartbeat` `/5min → `/status` (uptime 24h/7j/30j + latence SVG inline) |
| Invariants DB | `health-invariants.ts` — drift amount/paidAmount, items orphelins, etc. |
| AI Guardian | Webhook Sentry → HMAC → sanitize PII → Claude Haiku classify → issue GH / notif |

**Alertes actives** :
- 3 heartbeats KO consécutifs → SMS SUPERADMIN (dédup 1h Redis)
- Guardian severity ≥ 3 + catégorie `infra/data_corruption` → notif SUPERADMIN

---

## 6. Base de données

### Schema
- 34 modèles, 84 migrations versionnées, 65 indexes
- 19 colonnes monétaires en `Decimal(10,2)` (max 99 999 999.99 MAD)
- Trigger PG `trg_recompute_invoice_amount` — drift `Invoice.amount` impossible
- CHECK constraint `paidAmount <= amount + 0.01`
- Soft-delete : `deletedAt DateTime?` sur User, Pet, Booking — 85 fichiers filtrés explicitement

### Migrations
- Script `db-migrate.mjs` : validation statique (DROP sans IF EXISTS, DELETE sans WHERE) + SHA-256 checksum
- Convention `down.sql` ou `@rollback: not-applicable` — rollback testable
- CI `migration-rollback-check.yml` : pg_dump before/after up→down
- `SCHEMA.md` auto-généré depuis le schema, CI fail si outdated

### Hot paths indexés
```sql
@@index([status, startDate])   -- cron reminders + capacity overlap
@@index([status, endDate])     -- même chemin retour
@@index([userId, read])        -- notif unread count
@@index([type, createdAt])     -- dedup batch notifications
@@index([invoiceId, category]) -- analytics drill-down + allocation séquentielle
```

---

## 7. DevOps / CI

### Workflows GitHub Actions
| Workflow | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | push/PR main | lint + tsc + vitest + E2E Playwright |
| `migration-check.yml` | prisma/** changé | validate + dry-run + SCHEMA.md check |
| `migration-rollback-check.yml` | migrations/** | pg_dump before/after rollback |
| `soft-delete-check.yml` | src/** | grep deletedAt null compliance |
| `lighthouse.yml` | push main | Lighthouse CI perf audit |

### Déploiement
- Vercel (Next.js natif) — Lambdas < 250 MB (exclusions `.nft.json` configurées)
- 15 crons Vercel protégés par `x-cron-secret`
- Boot guard `assertProductionEnv()` : throw au démarrage si var critique manquante en prod

### Secrets requis en production
`NEXTAUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `TOTP_ENCRYPTION_KEY`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_HOST`, `UPSTASH_REDIS_PASSWORD`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `SENTRY_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `GUARDIAN_GITHUB_REPO`

---

## 8. Documentation

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | Guide complet pour AI : commandes, architecture, règles métier verrouillées, conventions, historique sessions |
| `HISTORY.md` | Décisions architecturales avec commit hash |
| `docs/RUNBOOK.md` | 7 procédures d'incident (login, DB, paiement, crons, storage, SMS, Sentry) |
| `docs/SCHEMA.md` | Référence DB auto-générée — 34 modèles, champs/types/relations/indexes |
| `docs/MIGRATIONS.md` | Checklist pre-push migrations |
| `docs/GUARDIAN.md` | Setup AI Guardian (Sentry webhook + GitHub PAT) |
| `docs/UPTIME.md` | Setup monitoring uptime |
| `docs/RESTORE_DRILL.md` | Procédure restore PITR Supabase |
| `docs/SECRET_ROTATION.md` | Rotation des secrets production |
| `docs/PERFORMANCE.md` | Profiling + optimisation |
| `docs/REALTIME_NOTIFICATIONS.md` | Architecture transactionnel vs batch |
| + 7 autres docs techniques | … |

---

## 9. Risques ouverts

| Risque | Sévérité | Note |
|---|---|---|
| 4 god-files > 1000 lignes sur `main` | MEDIUM | Corrigés sur `claude/regex-implementation-W9bVx`, PR non fusionné |
| next-auth encore en beta (5.0.0-beta.31) | MEDIUM | Surveillance releases GA ; migration prévue |
| Coverage global non mesuré en CI | LOW | Vitest `--coverage` non activé — Stryker = exécution manuelle |
| Load tests k6 hors pipeline PR | LOW | Exécution manuelle uniquement — pas de baselines automatiques |
| Staging env non visible dans la config | LOW | Tous les tests tournent sur prod-mirrored (Vercel previews) |
| Migrations 20260510 produit non appliquées | LOW | Documentées dans CLAUDE.md, SQL idempotent fourni |

---

## 10. Ce que ce projet fait bien (points de différenciation)

1. **Documentation AI-first** : `CLAUDE.md` de 107 sections permet à un LLM de reprendre le projet sans contexte
2. **Sécurité en profondeur** : 4 couches (auth + TOTP + rate-limit composite + HMAC webhooks)
3. **Decimal strict sur l'argent** : 0 float sur les colonnes MAD — rare sur les petits projets
4. **Observabilité complète** : Sentry + structured logs + health + status + AI Guardian — niveau production SaaS
5. **Cron idempotence** : Redis NX EX + déduplication DB = double-envoi impossible même sous load
6. **Migrations bidirectionnelles** : down.sql + CI rollback check — rollback fiable sous 5 min
7. **Feature flags maison** : sticky bucketing + cache Redis + kill-switch — sans dépendance GrowthBook
8. **Service layer propre** : logique métier hors des routes API depuis session 2026-04-30
