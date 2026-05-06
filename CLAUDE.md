# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Mémoire permanente de projet — ne jamais supprimer une ligne sans accord explicite.

---

## COMMANDES ESSENTIELLES

```bash
# Développement
npm run dev              # Lance Next.js en mode dev (port 3000)
npm run lint             # ESLint via next lint
npx tsc --noEmit         # Vérification TypeScript — TOUJOURS avant commit

# Base de données
npm run db:generate      # prisma generate (sans connexion DB — régénère le client TS)
npm run db:migrate       # prisma migrate dev (nécessite DB locale)
npm run db:push          # prisma db push (sync schema sans migration)
npm run db:studio        # Prisma Studio (UI de la DB)

# Build
npm run build            # next build (échoue sur Google Fonts sans réseau — normal en sandbox)
```

**Important DB** : la DB locale (`localhost:5432`) est inaccessible en environnement sandbox.
`npx prisma generate` (= `npm run db:generate`) fonctionne sans connexion et suffit pour régénérer le client TypeScript après modification du schema.
Les migrations sont créées manuellement dans `prisma/migrations/YYYYMMDD_nom/migration.sql`.

---

## CONTEXTE PROJET

**Dog Universe** est une application web de gestion de pension pour animaux (chiens et chats), basée au Maroc.
- Stack : **Next.js 15 App Router**, **Prisma**, **PostgreSQL (Supabase)**, **NextAuth**, **next-intl** (fr/en)
- Déploiement : **Vercel**
- Devises : **MAD (Dirhams marocains)** — toujours afficher avec `formatMAD()`
- Deux rôles principaux : `ADMIN` / `SUPERADMIN` (backoffice) et `CLIENT` (espace client)
- Le rôle `SUPERADMIN` a accès à la gestion des utilisateurs (`/admin/users`) — ADMIN non

---

## ARCHITECTURE CLÉS

### Structure des routes
```
src/app/[locale]/
  admin/          → backoffice (protégé ADMIN/SUPERADMIN)
  client/         → espace client (protégé CLIENT)
src/app/api/      → API routes Next.js
src/components/
  layout/         → AdminSidebar, ClientSidebar
  shared/         → composants réutilisables (MemberCard, LoyaltyBadge, etc.)
  ui/             → composants shadcn/ui
src/lib/
  prisma.ts       → instance Prisma singleton
  loyalty.ts      → logique grades fidélité
  upload.ts       → upload fichiers (Supabase Storage prod / filesystem dev)
  supabase.ts     → client Supabase admin (Storage)
```

### Base de données — modèles Prisma
| Modèle | Rôle |
|---|---|
| `User` | Clients et admins |
| `Pet` | Animaux (chiens/chats) |
| `Booking` | Réservations (BOARDING / PET_TAXI) |
| `Invoice` | Factures |
| `LoyaltyGrade` | Grade fidélité par client (1-to-1 avec User) |
| `LoyaltyBenefitClaim` | Réclamations d'avantages fidélité |
| `Notification` | Notifications in-app |
| `AdminNote` | Notes internes admin sur clients/animaux |
| `ActionLog` | Journal d'actions |
| `ClientContract` | Contrat signé par le client |
| `StayPhoto` | Photos de séjour |
| `Review` | Avis post-séjour client (1-to-1 avec Booking, rating 1-5, comment optionnel) |

**`Invoice.periodDate`** — date de début du séjour associé (`booking.startDate`), utilisée comme date de référence pour le mois de facturation dans `/admin/billing`. Filtre mensuel billing : `OR [{ periodDate: { gte, lte } }, { periodDate: null, issuedAt: { gte, lte } }]` — priorité à `periodDate` si présent, fallback sur `issuedAt` pour les factures legacy sans `periodDate`.

**`ClientContract` — walk-ins exclus** — Les clients `isWalkIn: true` n'ont pas d'espace portail, donc pas de contrat attendu. Toujours filtrer `isWalkIn: false` dans les pages/APIs qui traitent les contrats. Le cron `contract-reminders` et la page `/admin/contracts` ont ce filtre.

---

## SYSTÈME DE FIDÉLITÉ

### Grades et seuils (NE PAS MODIFIER sans accord)
| Grade | Séjours | Condition alternative |
|---|---|---|
| BRONZE | 1–3 | — |
| SILVER | 4–9 | — |
| GOLD | 10–19 | — |
| PLATINUM | 20+ | OU ≥ 55 000 MAD de CA |

- Le grade est calculé automatiquement via `calculateSuggestedGrade()` dans `src/lib/loyalty.ts`
- L'admin peut **toujours** faire un override manuel (`isOverride: true` dans `LoyaltyGrade`)
- Les seuils internes ne sont **jamais** affichés au client

### Avantages (`GRADE_BENEFITS` dans `loyalty.ts`)
Chaque avantage a un `key` unique, `labelFr`, `labelEn`, et `claimable: boolean`.
- `claimable: false` → avantage automatique (ex: priorité de réservation), juste affiché
- `claimable: true` → le client peut cliquer "Réclamer", crée un `LoyaltyBenefitClaim` en statut `PENDING`

### Réclamations d'avantages (`LoyaltyBenefitClaim`)
- Statuts : `PENDING` → `APPROVED` ou `REJECTED` (avec raison obligatoire)
- API client : `POST/GET /api/loyalty/claims`
- API admin : `GET /api/admin/loyalty/claims` + `PATCH /api/admin/loyalty/claims/[id]`
- Page admin : `/admin/loyalty` avec tabs filtrables et badge en sidebar

---

## CARTE MEMBRE (`MemberCard`)

Composant : `src/components/shared/MemberCard.tsx`

**Props requises :**
```ts
clientId: string        // pour le QR code
clientName: string
pets: { name: string; species: string }[]  // PAS un seul pet, le tableau entier
grade: Grade
totalStays: number
totalSpentMAD: number
locale: string
claims: { benefitKey: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]
```

**Règles visuelles :**
- 4 styles distincts : BRONZE (tons caramel), SILVER (tons violet-gris), GOLD (tons dorés), PLATINUM (fond sombre `#141428` avec accents `#D4AF37`)
- QR code unique en haut à droite (composant `MemberQRCode`, encode `du:client:{clientId}`)
- Affichage des animaux groupé par espèce : `"Max · Luna (2 chiens) — Milo (chat)"`
- Section avantages en deux blocs : automatiques (dot) / à réclamer (bouton interactif)
- Barre de progression vers le grade suivant

---

## UPLOAD DE FICHIERS

**Règle absolue : ne jamais écrire en filesystem en production.**

`src/lib/upload.ts` détecte automatiquement l'environnement :
```
Si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sont définis
  → Supabase Storage (bucket "uploads", dossiers pets/ documents/ stays/)
  → retourne une URL publique permanente
Sinon (dev local)
  → writeFile dans public/uploads/ (gitignored)
  → retourne /uploads/subfolder/filename
```

`src/lib/supabase.ts` contient :
- `uploadBuffer(buffer, key, mimeType)` — bucket public, pour les photos (pets/, stays/)
- `uploadBufferPrivate(buffer, key, mimeType)` — bucket privé, retourne la clé (pas d'URL)
- `createSignedUrl(key, expiresIn?)` — URL signée courte durée (1h par défaut) pour les fichiers privés
- `deleteFromStorage(key)` — suppression du bucket public
- `deleteFromPrivateStorage(key)` — suppression du bucket privé

**Architecture deux buckets :**
| Fichier | Bucket | Accès |
|---|---|---|
| `pets/` (photos animaux) | `uploads` (public) | `getPublicUrl()` |
| `stays/` (photos séjour) | `uploads` (public) | `getPublicUrl()` |
| `documents/` (documents clients) | `uploads-private` (privé) | `createSignedUrl()` |
| `contracts/` (contrats signés) | `uploads-private` (privé) | `createSignedUrl()` |

**Migration requise** : `prisma/migrations/20260405_private_storage/migration.sql` — à exécuter sur Supabase :
- Crée le bucket `uploads-private` (public=false)
- Rend `ClientContract.pdfUrl` nullable (champ déprécié — remplacé par `storageKey`)
- Ajoute une policy RLS bloquant tout accès anon/authenticated au bucket privé

**Variables d'env Supabase nécessaires en production :**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (défaut : `"uploads"`)
- `SUPABASE_PRIVATE_STORAGE_BUCKET` (défaut : `"uploads-private"`)

---

## SYSTÈME DE NOTIFICATIONS IN-APP

Modèle `Notification` avec champ `type`. Types existants :
```
BOOKING_CONFIRMATION | BOOKING_VALIDATION | BOOKING_REFUSAL
STAY_REMINDER | INVOICE_AVAILABLE | ADMIN_MESSAGE | STAY_PHOTO
LOYALTY_UPDATE | PET_BIRTHDAY | BOOKING_RESCHEDULE_REQUEST | REVIEW_REQUEST
TAXI_NEAR_PICKUP | TAXI_ARRIVED
```

Chaque notification a `titleFr`, `titleEn`, `messageFr`, `messageEn`, `metadata` (JSON string).

Page notifications : `src/app/[locale]/client/notifications/page.tsx`
Le `TYPE_CONFIG` dans cette page définit l'icône et la couleur par type — **toujours y ajouter le nouveau type** lors de la création d'un type de notification.

---

## CRONS (Vercel)

Définis dans `vercel.json`, tous à **08h00 UTC** :
| Route | Fréquence | Rôle |
|---|---|---|
| `/api/cron/reminders` | Quotidien | Rappels J-1 séjour (arrivée + départ) |
| `/api/cron/birthday-notifications` | Quotidien | Notifications anniversaire des animaux |
| `/api/cron/contract-reminders` | Lundi (hebdo) | Rappel signature contrat aux clients sans contrat |
| `/api/cron/overdue-invoices` | Quotidien (09h UTC) | Relances factures impayées J+30 / J+60 (depuis 2026-05-04) |
| `/api/cron/review-requests` | Quotidien 10h | Envoie REVIEW_REQUEST aux clients dont le séjour s'est terminé dans les 24h sans avis |

**Protection :** header `x-cron-secret` vérifié contre `CRON_SECRET` (déjà défini sur Vercel).
Vercel l'injecte automatiquement via `Authorization: Bearer` pour ses propres crons.

### Worker BullMQ (depuis 2026-04-29)
| Route | Fréquence | Rôle |
|---|---|---|
| `/api/workers/process` | Chaque minute | Dépile et traite les jobs email + SMS des queues BullMQ |

Architecture asynchrone :
- `POST /api/bookings` et `PATCH /api/admin/bookings/[id]` → `enqueueEmail()` / `enqueueSms()` (non-bloquant)
- Si Redis down au moment de l'enqueue → fallback direct (sendEmail / sendSMS)
- Le cron `/api/workers/process` crée des Workers BullMQ éphémères, traite max 10 jobs/queue en 55 s, puis close
- Jobs épuisant leurs 3 tentatives → archivés dans la queue `dlq` (Dead Letter Queue)
- Monitoring : `/admin/queues` (SUPERADMIN uniquement) — compteurs + rejouer les jobs échoués

**IORedis vs @upstash/redis :**
- `@upstash/redis` (REST HTTP) → cron-lock uniquement
- `ioredis` (TCP) → BullMQ uniquement — requiert `UPSTASH_REDIS_HOST` + `UPSTASH_REDIS_PASSWORD`

**Fichiers clés BullMQ :**
```
src/lib/redis-bullmq.ts          — connexion IORedis (singleton + isBullMQConfigured())
src/lib/queues/index.ts          — Queue singletons + enqueueEmail() / enqueueSms()
src/workers/processors.ts        — processEmailJob() / processSmsJob()
src/app/api/workers/process/route.ts  — cron endpoint (Worker éphémère + DLQ)
src/app/api/admin/queues/route.ts     — GET stats / POST retry (SUPERADMIN)
src/app/[locale]/admin/queues/page.tsx — UI monitoring (SUPERADMIN)
```

**Variables d'env BullMQ requises en production :**
- `UPSTASH_REDIS_HOST` — hostname TCP Upstash (différent de l'URL REST)
- `UPSTASH_REDIS_PORT` — port TLS Upstash (défaut 6379)
- `UPSTASH_REDIS_PASSWORD` — mot de passe Upstash TCP

### Idempotence Redis (depuis 2026-04-28)
Chaque cron est protégé par `acquireCronLock()` de `src/lib/cron-lock.ts` :
- Lock key : `cron:{name}:{period}` — `YYYY-MM-DD` (daily) ou `YYYY-Www` (weekly, ISO)
- `SET NX EX` atomique via Upstash Redis — premier appelant gagne
- **Fail-open** : si Redis absent/down → retourne `true` (cron s'exécute quand même)
- Défense en profondeur : déduplication par-entité dans le DB reste en place
- Variables d'env requises : `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

### Idempotency-Key sur POST /api/bookings (depuis 2026-04-30)
- `src/lib/idempotency.ts` — `tryAcquireIdempotency(request, scope, ttl?)` SET NX EX 24h
- Header optionnel `Idempotency-Key: <8-128 chars [A-Za-z0-9_\-]>`
- Première requête → `{ acquired: true }` ; replay dans la fenêtre TTL → 409 `DUPLICATE_REQUEST`
- **Fail-open** : Redis down → laisse passer (perte de double-booking < perte de booking)
- Pattern Stripe : permet aux clients de retry sans risque de duplicata

### Cache Redis + unstable_cache (depuis 2026-04-30)
`src/lib/cache.ts` — couche unique Upstash REST, fail-open systémique :
- `cacheReadThrough(key, ttl, loader)` — read-through avec fallback DB
- `CacheKeys.{capacityLimits, loyaltyGrade(userId), notifCount(userId)}` — clés centralisées
- `CacheTTL.{capacityLimits: 300, loyaltyGrade: 300, notifCount: 30}`

**Hot paths cachés :**
| Donnée | TTL | Mécanisme | Invalidation |
|---|---|---|---|
| `capacity_dog/cat` settings | 5 min | Redis | `invalidateCapacityCache()` après update Setting |
| `LoyaltyGrade` per userId | 5 min | Redis | `invalidateLoyaltyCache(userId)` sur upsert/override |
| `Notification` unread count per userId | 30 s | Redis | auto via `createNotification` ; manuel sur PATCH read |
| Admin pendingCount + claimsCount | 30 s | `unstable_cache` tag `admin-counts` | `revalidateTag('admin-counts')` sur POST/PATCH bookings + claims |

**Décisions :**
- `getCapacityLimits(client)` bypass cache si `client !== prisma` (lecture en `$transaction` Serializable doit lire la DB pour participer au snapshot)
- `addonRequestCount` admin (per-userId) NON caché : index `(userId, read)` déjà rapide
- `tx.notification.create` (dans `admin/loyalty/claims [id] PATCH`) bypass `createNotification` → invalidation manuelle après commit

### Rate-limiting composite IP+userId (depuis 2026-04-30)
`src/middleware.ts` — bucket key composite quand un user est authentifié :
```ts
let bucketKey = ip;
try {
  const session = await auth();
  if (session?.user?.id) bucketKey = `u:${session.user.id}`;
} catch { /* fail-safe : keep IP */ }
```
- User authentifié → limite par `userId` (préfixe `u:` pour éviter collision IP/cuid)
- Anonyme → limite par IP
- `auth()` failure → fallback IP, jamais bloquant
- Empêche un user authentifié de bypasser via VPN / réseau mobile

**Buckets actifs :**
| Bucket | Limite | Routes |
|---|---|---|
| `auth` | 10 / 15 min | signin, register, callback |
| `passwordReset` | 5 / 60 min | reset-password, profile/password |
| `bookings` | 20 / 60 min | POST /api/bookings |
| `uploads` | 30 / 60 min | uploads, contracts/sign, vaccinations/extract |
| `adminMutation` | 300 / 60 min | tout `/api/admin/*` mutating method |
| `taxiStream` | 60 / 60 min | GET /api/taxi/{token}/stream (SSE) |
| `rgpd` | 5 / 60 min | /api/user/export (GET), /api/user/anonymize (POST) |
| `addonRequest` | 10 / 60 min | POST /api/bookings/{id}/addon-request |

### Logique anniversaire
- Requête SQL raw `EXTRACT(MONTH)` + `EXTRACT(DAY)` sur `Pet.dateOfBirth`
- Déduplication : pas de double envoi si déjà envoyé aujourd'hui pour ce pet
- Âge calculé : `today.getFullYear() - dateOfBirth.getFullYear()`

---

## ANTHROPIC API

### Usage actuel
- **Extraction automatique de documents de vaccination** (vignettes, carnets, passeports animaux, certificats vétérinaires) — formats supportés : PDF, JPEG, PNG, WebP, GIF
- **Endpoint** : `src/app/api/pets/[id]/vaccinations/extract/route.ts` (POST) — appel via `callClaudeExtraction(base64, mimeType)`
- **Modèle utilisé** : `claude-haiku-4-5-20251001` (`max_tokens: 512`)
- **Variable d'env** : `ANTHROPIC_API_KEY` (si absente → fallback gracieux : DRAFT vaccination créée avec champs vides, l'utilisateur remplit manuellement)
- **Sortie** : JSON `{ vaccineType, date, nextDueDate, comment, confidence: HIGH|MEDIUM|LOW, confidenceNote }` → stocké en `Vaccination` status `DRAFT`
- **Idempotence** : si un DRAFT existe déjà pour `(petId, sourceDocumentId)`, l'endpoint le retourne sans rappeler l'API

### Règle PII (RGPD)
**Ne jamais inclure de données personnelles client dans les prompts.**
- OK : contenu du document (nom du vaccin, dates, numéro de lot, fabricant, nom du vétérinaire/clinique présent sur le document)
- NON : nom du client (propriétaire), email, téléphone, adresse, ID client/animal en clair, métadonnées DB
- Le PDF/image est traité comme un document opaque — le prompt (`EXTRACTION_PROMPT`) est une constante statique sans interpolation. Seuls le binaire base64 + ce prompt sont envoyés. Aucune donnée provenant de `User` ou `Pet` ne transite par l'API.

### Best practices
- Toujours valider/sanitizer la réponse JSON avant insertion DB (strip markdown fences, `JSON.parse` dans try/catch — actuellement parse simple ; envisager un `Zod parse` pour durcir)
- Catch error + log structuré (`console.error(JSON.stringify({ level: 'error', service: 'pet', message: '...', error, timestamp }))`)
- Fallback gracieux : tout échec (API down, parse JSON, mime non supporté) → `extraction = null` → DRAFT vide créé quand même (jamais de 500 visible client pour cause d'extraction)
- Le `fileUrl` est résolu via `createSignedUrl(storageKey)` (bucket privé) à chaque appel pour éviter l'expiration 1h des URL signées
- Endpoint protégé par rate-limit `uploads` (30 / 60 min) + auth (owner ou ADMIN/SUPERADMIN)

---

## RÈGLES FORMULAIRES ANIMAUX

**`dateOfBirth` est OBLIGATOIRE** sur tous les formulaires (client et admin) depuis la session du 2026-03-08.
- Validation JS en frontend (toast d'erreur explicite)
- Champ marqué `*` dans le label
- Raison : calcul automatique de l'âge + anniversaires automatiques

---

## RÈGLES MÉTIER COMPTABILITÉ (verrouillées)

**Filtre mensuel unique :** toute requête comptable filtrant des `Invoice`
sur un mois DOIT passer par `getMonthlyInvoicesWhere(monthStart, monthEnd)`
de `src/lib/billing.ts`. Ne **jamais** filtrer par `issuedAt`, `createdAt`
ou `periodDate` directement pour la comptabilité — ces champs sont des
détails techniques, pas la source de vérité.

Les trois cas couverts :
1. Au moins un `Payment.paymentDate ∈ [monthStart, monthEnd]` (caisse prime)
2. Aucun paiement, séjour `CONFIRMED`/`IN_PROGRESS` chevauchant le mois
3. Facture manuelle (`bookingId = null`) émise ce mois

**Catégories d'`InvoiceItem` :** si `productId` est non-null, `category` DOIT
être `'PRODUCT'`. Toute création d'`InvoiceItem` lié à un produit passe par
`resolveItemCategory(productId, fallback)` de `src/lib/billing.ts`. La
migration `20260507_cleanup_categories` normalise les rows legacy.

**Détail encaissé (analytics) :** le drill-down par catégorie sur
`/admin/analytics` affiche l'**encaissé** ce mois (allocation séquentielle
Payment → InvoiceItem via `computeMonthlyRevenueByCategory`), jamais le
facturé. Les items à 0 encaissé sont exclus.

---

## CONVENTIONS DE CODE

- **Langue des variables/fonctions** : anglais
- **Langue de l'UI** : fr/en via `next-intl` (toujours les deux)
- **Composants server** : pages Next.js par défaut (pas de `'use client'` sauf nécessaire)
- **Composants client** : préfixés `'use client'`, nommés avec suffixe `Manager`, `Button`, `Modal` si interactifs
- **Prisma** : toujours utiliser l'instance singleton de `src/lib/prisma.ts`
- **Migrations** : si DB locale inaccessible, créer le SQL manuellement dans `prisma/migrations/YYYYMMDD_nom/migration.sql` et fournir le SQL à exécuter sur Supabase
- **Zéro TypeScript errors** : toujours vérifier avec `npx tsc --noEmit` avant commit
- **Formatage monétaire** : toujours `formatMAD()` de `src/lib/utils`
- **Dates** : `formatDate()` ou `formatDateShort()` de `src/lib/utils`

### Règle Server Component / Client Component — utilitaires partagés
**Ne jamais exporter une fonction helper depuis un module `'use client'`.** Next.js 15 wraps tous les exports de ces modules en "client references" — les importer dans un Server Component provoque `"Attempted to call X() from the server but X is on the client"`.

Pattern correct : si un helper est utilisé à la fois par un Server Component et un Client Component, le placer dans un fichier neutre **sans directive** (ex: `format-month.ts`), importé par les deux.

Exemple : `src/app/[locale]/admin/billing/format-month.ts` (extrait de `BillingClient.tsx` pour cette raison).

---

## SIDEBAR ADMIN

`src/components/layout/AdminSidebar.tsx` — props :
```ts
pendingCount: number         // réservations PENDING → badge amber sur "Réservations"
pendingClaimsCount: number   // claims PENDING → badge gold sur "Réclamations fidélité"
userRole: string             // 'ADMIN' | 'SUPERADMIN'
```

Compteurs chargés dans `src/app/[locale]/admin/layout.tsx` via `Promise.all`.

---

## SYSTÈME DE RÉSERVATIONS — WORKFLOWS ET STATUTS

### Statuts DB (`Booking.status`)
`PENDING` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED` (flux normal)
`CANCELLED` / `REJECTED` (sortie possible à tout moment par l'admin)

**Important** : `IN_PROGRESS` doit être présent dans `VALID_STATUSES` de `PATCH /api/admin/bookings/[id]`. Ne jamais l'omettre.

### Pipelines affichés (labels UI ≠ statuts DB)
| Statut DB   | Pension (BOARDING)      | Pet Taxi (PET_TAXI)       |
|-------------|-------------------------|---------------------------|
| PENDING     | Demande reçue           | Transport planifié        |
| CONFIRMED   | Séjour confirmé         | Chauffeur en route        |
| IN_PROGRESS | Dans nos murs           | Animal à bord             |
| COMPLETED   | Séjour terminé          | Arrivé à destination      |

### Board Kanban admin (`ReservationsKanban.tsx`)
- Centralisé dans `NEXT_STATUS` (transitions) et `ACTION_LABELS` (boutons) — ne jamais coder les statuts en dur ailleurs
- Chaque carte a un bouton d'action contextuel → `PATCH /api/admin/bookings/{id}`
- Mise à jour **optimiste** : `useState` local sur les bookings, la carte se déplace immédiatement sans rechargement
- Le clic bouton `stopPropagation()` pour ne pas naviguer vers la fiche

### Fiche admin (`ReservationActions.tsx`)
- Bouton principal = prochaine étape du pipeline
- Section "Forcer un statut" masquée par défaut (dépliable) avec select complet
- Reçoit `serviceType` en prop (obligatoire pour déterminer le pipeline)

### Fiche client (`client/bookings/[id]/page.tsx`)
- Server Component — ne se re-render pas automatiquement
- `AutoRefresh` (`src/components/shared/AutoRefresh.tsx`) ajouté pour les réservations actives : appelle `router.refresh()` toutes les 30s
- Stepper visuel lecture seule : étapes passées ✓ / active surlignée / futures grisées
- Le client ne peut **jamais** modifier le statut

### Contraintes Pet Taxi (front + back)
- **Dimanche interdit** : `isValidTaxiDate()` dans le formulaire client
- **Horaires 10h-17h uniquement** : `isValidTaxiTime()` dans le formulaire client
- Validation dupliquée côté backend dans `POST /api/bookings` :
  - `SUNDAY_NOT_ALLOWED` → 400
  - `INVALID_TIME_SLOT` → 400
- S'applique au taxi standalone ET aux addons taxi d'une pension

---

## VERSIONS STACK (2026-05-02)

| Package | Version |
|---|---|
| Next.js | 15 (App Router, async params) |
| React | 19 |
| next-auth | 5.0.0-beta.25 (JWT, tokenVersion) |
| Prisma | 5.22.0 |
| next-intl | 4.9.2 (upgrade depuis 3.26 — GHSA-8f24) |
| @upstash/redis | 1.36.3 |
| @upstash/ratelimit | 2.0.8 |
| date-fns | 4.1.0 |
| Zod | 3.23.8 |
| @sentry/nextjs | (configuré server + edge + client + instrumentation-client) |
| Playwright | configuré, skip gracieux si secrets absents (`test.skip()` dans `beforeEach`) |
| Vitest | 4.1.5 (306 tests unitaires) |

**Pattern Next.js 15 params** : toujours `params: Promise<{ locale: string }>` + `const { locale } = await params` (async — pattern obligatoire sur main).

---

## ACTIONS MANUELLES EN ATTENTE

### ✅ Toutes les migrations Supabase exécutées (2026-05-01)
- `ALTER TABLE "User"/"Pet" ADD COLUMN deletedAt` — soft-delete opérationnel
- `ALTER TABLE "Booking"/"Invoice" ADD COLUMN version` — optimistic lock actif
- `INSERT INTO "Setting"` capacity defaults (20 chiens / 10 chats)
- Vérification : `SELECT COUNT(*) FROM "ClientContract" WHERE "pdfUrl" IS NOT NULL` → 0 ✅

### ✅ Variables d'env Vercel configurées (2026-05-01)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (cron-lock)
- `UPSTASH_REDIS_HOST` / `UPSTASH_REDIS_PORT` / `UPSTASH_REDIS_PASSWORD` (BullMQ TCP)

### Secrets GitHub pour E2E Playwright
Ajouter dans Settings → Secrets and variables → Actions :
- `TEST_CLIENT_EMAIL` / `TEST_CLIENT_PASSWORD` / `TEST_CLIENT_NAME`
- `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`
+ Créer le compte client de test dans la DB de production.
CI : les secrets sont exposés via `env:` au niveau step ET job dans `.github/workflows/ci.yml`.
Sans secrets : les 3 specs skippent gracieusement via `test.skip()` dans `beforeEach` — CI passe au vert.

---

## RISQUES CONNUS ET STATUT

| Risque | Statut | Impact |
|---|---|---|
| Capacity `excludeBookingId` non câblé | RÉSOLU (`4d7524e`) | Câblé sur les deux chemins d'extension admin |
| E2E Playwright | RÉSOLU | Secrets GitHub configurés, tests opérationnels en CI |
| Migration `20260405_private_storage` | RÉSOLU (2026-05-01) | Bucket `uploads-private` vérifié, 0 contrats legacy publics confirmés en DB. |
| Soft-delete User/Pet | RÉSOLU (`0dcf7c8`) | `deletedAt` ajouté à `User` + `Pet`, 28 fichiers filtrés, DELETE → soft-delete — migration SQL à exécuter sur Supabase |
| Sentry instrumentation API | RÉSOLU (`21bdccd`) | `Sentry.startSpan()` câblé sur POST /api/bookings + PATCH /api/admin/bookings/[id] avec attributs serviceType/petCount/bookingId |
| 2FA TOTP ADMIN/SUPERADMIN | **DURCI (2026-05-03)** | Bypass `/api/admin/*` corrigé (middleware retourne 403 `TOTP_REQUIRED`). Setup/disable exigent re-auth password ; disable + rotation exigent aussi un token TOTP courant. Replay protection (`lastTotpToken` + `lastTotpUsedAt`, fenêtre 90 s). Rate-limit `auth` (10/15 min) sur validate / verify-setup / disable. Secrets chiffrés AES-256-GCM via `TOTP_ENCRYPTION_KEY` (32 bytes hex). Migration : `20260503_totp_replay/migration.sql`. **Variable d'env requise en production : `TOTP_ENCRYPTION_KEY` — générer avec `openssl rand -hex 32`.** |
| Création réservation admin | RÉSOLU (2026-05-03, `f9f5552`) | `POST /api/admin/bookings` + page `/admin/reservations/new` (formulaire walk-in / clients existants, calendrier disponibilités, prix suggéré, auto-facture). Bouton "+ Créer une réservation" dans header `/admin/reservations`. |
| Routing slug conflict Next.js | RÉSOLU (2026-05-03, `8fc409d`) | `/api/taxi/[bookingId]/heartbeat` et `/api/taxi/[token]/stream` partageaient le même parent → Next.js 15 crashe le dev server au démarrage, toutes requêtes API renvoient HTML d'erreur (`Unexpected token '<'`). Renommé `[bookingId]` → `[token]` sur heartbeat. **Règle Next.js 15 : un seul nom de slug autorisé par niveau hiérarchique de route.** |
| TOTP UI ne faisait rien au clic | RÉSOLU (2026-05-04, `968e57d`) | `TotpSetupSection.tsx` envoyait `POST /setup` sans body alors que la route exige `{ password }` → API retournait 400 `INVALID_BODY` mais l'erreur n'était rendue que dans le step `'qr'` → silence total. Refonte : nouveau step `'password-setup'` (password + TOTP courant si rotation), errors visibles à chaque step avec labels lisibles. |
| Loyalty COMPLETED ne crée pas de grade | RÉSOLU (2026-05-04, `dcd2776`) | Guard `if (currentGrade && ...)` empêchait `update` si la row n'existait pas → tous les nouveaux clients restaient BRONZE après leur 1er séjour terminé. Fix : `update` → `upsert`, guard retiré. |
| Walk-in pets dans le compteur DOB manquant | RÉSOLU (2026-05-04, `38066da`) | `/admin/dashboard` comptait tous les pets sans `dateOfBirth`. Filtre `owner: { isWalkIn: false }` ajouté — walk-in = client one-shot, profil sparse, pas de DOB attendu. |
| GPS Pet Taxi end-to-end | LIVRÉ (2026-05-04, `c5377ab`) | Client : bouton "📍 Utiliser ma position" + reverse-geocode Nominatim → `pickupLat/Lng/Address`. Admin : boutons Google Maps + Waze sur fiche réservation. Geofencing : heartbeat chauffeur → notifs `TAXI_NEAR_PICKUP` (<1km) + `TAXI_ARRIVED` (<100m), flags Redis NX EX 1h pour dédupliquer, fail-open. Helper `haversineDistance()` dans `src/lib/geo.ts` (5 tests). Migration `20260504_taxi_gps_pickup` (6 colonnes sur `TaxiDetail`). |
| Boot guard env prod | RÉSOLU (2026-05-04) | `assertProductionEnv()` dans `src/lib/boot-checks.ts`, appelé depuis `instrumentation.ts → register()`. En prod, throw si l'une des vars manque ou est invalide : `TOTP_ENCRYPTION_KEY` (64 hex), `CRON_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Dev → warning seulement. |
| Indexes billing manquants | RÉSOLU (2026-05-04) | `Payment.paymentMethod`, `InvoiceItem.category`, `Invoice(clientId,status)` ajoutés. Migration manuelle `20260504_billing_indexes` à exécuter sur Supabase (CREATE INDEX CONCURRENTLY — hors transaction Prisma). |
| Cron relances impayés J+30/J+60 | LIVRÉ (2026-05-04) | `/api/cron/overdue-invoices` daily 09h UTC. Templates `invoice_overdue_30` / `invoice_overdue_60` (fr/en, ferme mais professionnel). Notif `INVOICE_OVERDUE` avec `metadata { invoiceId, reminderKind }` pour dédupliquer 24h. Walk-in clients exclus. |
| Zod `.passthrough()` sur PATCH /api/admin/bookings | RÉSOLU (2026-05-04) | Remplacé par `.strict()` avec whitelist explicite des discriminateurs (`patchBoardingDetail`, `addBookingItems`, `approveExtension`, `rejectExtension`, `editDates`, `extendEndDate`, `forcePaidInvoice`). Champs inconnus rejetés. |
| Float → Decimal sur colonnes monétaires | RÉSOLU (2026-05-04) | Toutes les colonnes MAD migrées en `Decimal @db.Decimal(10,2)` (User, Booking, BookingItem, BoardingDetail, TaxiDetail, TaxiTrip, Invoice, InvoiceItem, Payment, MonthlyRevenueSummary). Migration SQL : `prisma/migrations/20260504_decimal_money`. Helper `toNumber()` dans `src/lib/decimal.ts`. `formatMAD()` accepte désormais `Decimal | number`. |
| Authz cross-role factures | RÉSOLU (2026-05-04) | GET/PATCH/DELETE `/api/invoices/[id]` : ADMIN ne peut accéder qu'aux factures dont `client.role === 'CLIENT'`. SUPERADMIN passe partout. |
| Idempotence workers BullMQ | RÉSOLU (2026-05-04) | `processEmailJob` / `processSmsJob` : flag Redis `job:processed:{queue}:{jobId}` SET NX EX 24h via `tryAcquireFlag`. Garde at-most-once même si BullMQ retraite par erreur. Fail-open si Redis down. |
| Cron worker tour à vide | RÉSOLU (2026-05-04) | `/api/workers/process` : early-exit si `getJobCounts(waiting+active+delayed)` = 0 sur les deux queues ET aucun TaxiTrip `DRIVER_EN_ROUTE`. Économise les Workers BullMQ + connexions IORedis quand l'app est inactive. |
| Timing side-channel reset-password | RÉSOLU (2026-05-04) | `POST /api/reset-password` : floor de réponse 250 ms (pad au timeout résiduel). Empêche l'énumération par mesure du temps de réponse user-existe vs n'existe-pas. |
| next-auth GA | EN ATTENTE | Encore beta (5.0.0-beta.31 au 2026-05-04). Surveillance des releases ; upgrade prévu dès la GA stable. |

---

## DECIMAL MIGRATION (2026-05-04)

**Problème** : toutes les colonnes monétaires (MAD) étaient stockées en `Float` (PG `DOUBLE PRECISION`). Erreurs d'arrondi sur les sommes (`0.1 + 0.2 ≠ 0.3`), dérive cumulative sur les allocations de paiements multi-items.

**Solution** : `Decimal @db.Decimal(10, 2)` côté Prisma → `DECIMAL(10,2)` côté PostgreSQL. Précision exacte au centime, plage `[-99 999 999.99, 99 999 999.99]` MAD.

### Colonnes migrées
- `User.historicalSpendMAD`
- `Booking.totalPrice`
- `BookingItem.unitPrice`, `total`
- `BoardingDetail.groomingPrice`, `pricePerNight`, `taxiAddonPrice`
- `TaxiDetail.price`
- `TaxiTrip.price` (mais pas `distanceKm` → reste Float, ce n'est pas de l'argent)
- `Invoice.amount`, `paidAmount`
- `InvoiceItem.unitPrice`, `total`, `allocatedAmount`
- `Payment.amount`
- `MonthlyRevenueSummary.boardingRevenue / groomingRevenue / taxiRevenue / otherRevenue`

### Stratégie d'adaptation TypeScript

`Prisma.Decimal` est un objet runtime (pas un primitif). En TS strict, `decimal + number` est une erreur de type. Approche pragmatique adoptée :

1. **Boundary conversion via `toNumber()` (`src/lib/decimal.ts`)** : convertit `Decimal | number | string | null` → `number`. Utilisé au plus près du UI / des calculs JS.
2. **`formatMAD()` accepte `DecimalLike`** : aucun appelant n'a besoin de convertir manuellement avant l'appel. Idem pour `formatMAD()` dans `src/lib/sms.ts`.
3. **Conservation de l'arithmétique JS** : on convertit d'abord en `number`, on calcule, on écrit. Acceptable car : (a) la précision est garantie côté DB par le type DECIMAL ; (b) les calculs ponctuels sur < 10 items en JS ne génèrent pas assez de bruit pour casser le centime.
4. **Decimal arithmetic explicite** : non utilisée, l'API `Decimal.add()` aurait été lourde à généraliser sur 51 fichiers. Si un cas critique exige une exactitude absolue (multi-step), passer par `Prisma.Decimal` localement.

### Migration SQL

`prisma/migrations/20260504_decimal_money/migration.sql` — `ALTER TABLE ... ALTER COLUMN ... TYPE DECIMAL(10,2) USING ...::DECIMAL(10,2);` pour chaque colonne. À exécuter manuellement sur Supabase.

### Décisions

- `@db.Decimal(10, 2)` : 10 chiffres au total, 2 après la virgule → max 99 999 999.99 MAD (≈ 100 M MAD). Largement suffisant pour Dog Universe Maroc.
- **Migration in-place** sans default value : les valeurs existantes sont castées via `USING "col"::DECIMAL(10,2)` — PostgreSQL gère la conversion sans perte significative depuis `DOUBLE PRECISION` (déjà tronqué à 2 décimales par convention métier).
- **Lecture transparente** : `formatMAD(invoice.amount)` fonctionne directement, qu'`amount` soit `number` ou `Decimal`. Pas de breaking change pour les composants UI.

---

## CAPACITÉ PENSION — ARCHITECTURE (depuis 2026-04-28)

### `src/lib/capacity.ts`
- `getCapacityLimits()` — lit `capacity_dog` / `capacity_cat` dans `Setting` (défauts : 20/10)
- `countOverlappingPets(species, window, options)` — compte les animaux actifs sur une fenêtre de dates via `bookingPets` join
- `checkBoardingCapacity({ petIds, startDate, endDate, excludeBookingId? })` — orchestre les deux

### Règles métier
- Statuts comptant dans l'occupancy : `PENDING`, `CONFIRMED`, `IN_PROGRESS` (un PENDING non encore validé réserve quand même la place)
- Overlap : `startDate <= window.endDate AND endDate >= window.startDate`
- Erreur API : `CAPACITY_EXCEEDED` → 400 avec `{ species, available, requested, limit }`
- Client : toast "La pension est complète pour ces dates" (fr/en)
- `excludeBookingId` : prévu pour extensions de séjour (non câblé actuellement)

---

## TEMPLATES EMAIL — LOGIQUE AVANCÉE (`src/lib/email.ts`)

### `getEmailTemplate(name, data, locale, pets?)`

Le 4ème paramètre `pets` est optionnel : `{ name?, species?, gender? }[]`. Il active les helpers ci-dessous.

### Helpers genre/nombre (calculés dans `getEmailTemplate`)
- `isPlural` = `pets.length > 1`
- `_companion` : accord genre+nombre via `petCompanion(pets)` de `src/lib/sms.ts` — retourne "votre compagnon / compagne / compagnons / compagnes"
- `_companionFr` = `"votre compagnon·ne Max, Rex et Luna"` (noms inclus si dispo)
- `_companionEn` = `"your companion(s) Max, Rex and Luna"`

### `joinNames(names)` / `joinNamesEn(names)`
- 0 → `''` ; 1 → `"Max"` ; 2 → `"Max et Luna"` ; 3+ → `"Max, Rex et Luna"` (virgules sauf avant dernier)
- EN : même logique avec `"and"`

### `buildAnimalLine(speciesLabel, joinAcross)` — règle critique
Construit la ligne `"Max, Rex (chiens) et Mimi, Luna (chats)"`.

**Règle séparateur intra-groupe :**
- 1 seul groupe d'espèce → `joinAcross(names)` (utilise " et " natif → `"Max et Luna (chiens)"`)
- Plusieurs groupes → `names.join(', ')` dans chaque groupe (virgules uniquement → évite ambiguïté `"Max et Luna (chiens) et Mimi (chat)"`)

Le join **entre** groupes utilise toujours `joinAcross` (" et " / " and ").

### Template `booking_validated`
```
Ligne service     : Service : {d.service} | Animal/Animaux : {_animalLineFr} | Dates : Du X au Y
Phrase principale : Nous attendons {_companionFr} avec impatience.
```
- `_dateRangeFr` : `d.endDate ? "Du X au Y" : "Le X"` (locale `fr-MA` pour les dates)
- `_dateRangeEn` : `d.endDate ? "From X to Y" : "On X"` (locale `en-GB`)
- Noms d'animaux : **non échappés** (accents, tirets acceptés tels quels — voir XSS note : `escapeHtml` s'applique aux champs `data.*` sauf petName)
- Call sites : `src/app/api/admin/bookings/[id]/route.ts` + `src/app/api/bookings/[id]/route.ts` — les deux passent maintenant `pets` en 4ème arg

---

## PWA

Support PWA ajouté (2026-05-02) :
- `public/manifest.json` — thème `#141428` / `#D4AF37`, orientation portrait-primary, maskable icon
- `public/sw.js` — cache-first `/_next/static/**`, network-first navigation, offline fallback `/offline.html`
- `public/offline.html` — page branded hors-ligne (patte de chien + bouton Réessayer)
- `public/icons/icon-192.png` + `icon-512.png` — générés via `sharp` depuis SVG (fond sombre, cercle gold, "DU")
- `src/components/shared/PWAInstaller.tsx` — `'use client'`, enregistre `/sw.js` dans `useEffect`
- `src/app/layout.tsx` — `metadata.manifest`, `appleWebApp`, `icons.apple` + `<PWAInstaller />` dans `<body>`

---

## CALENDRIER DE DISPONIBILITÉS

Ajouté (2026-05-02) :

### `GET /api/availability`
- Public (pas d'auth requise)
- Query params : `month=YYYY-MM`, `species=DOG|CAT`
- Une seule requête Prisma → comptage par jour en JS (pas de N+1)
- Statuts : `available` (>20% libre), `limited` (≤20%), `full` (0 place)
- Cache Redis 5 min via `cacheReadThrough('availability:{species}:{month}', 300, loader)`
- Capacité lue dans `Setting` (`capacity_dog` / `capacity_cat`)
- Statuts comptés : `PENDING`, `CONFIRMED`, `IN_PROGRESS` (cohérent avec `checkBoardingCapacity`)
- Soft-delete : `booking.deletedAt: null` obligatoire

### `src/components/shared/AvailabilityCalendar.tsx`
- `'use client'`, aucune lib externe — React + Tailwind uniquement
- Navigation mois, en-têtes français (Lu Ma Me Je Ve Sa Di)
- Couleurs : vert (available), jaune (limited), rouge (full), gris (passé)
- Tooltip hover : "X places restantes" / "Complet"
- Sélection de plage : 2 clics → start + end, surbrillance bleue
- Props : `species`, `selectedStart/End`, `onRangeSelect`, `interactive`, `initialMonth`

### Intégrations
- **Admin** : `/admin/calendar` — deux panneaux côte à côte DOG + CAT, lecture seule
- **Client** : formulaire de réservation Step 3 (BOARDING) — calendrier lecture seule, `selectedStart/End` miroir des date pickers

---

## GPS PET TAXI — ARCHITECTURE (depuis 2026-05-04)

### Modèle DB (`TaxiDetail`)
6 colonnes ajoutées via migration `20260504_taxi_gps_pickup` :
```prisma
pickupLat       Float?
pickupLng       Float?
pickupAddress   String?
dropoffLat      Float?
dropoffLng      Float?
dropoffAddress  String?
```

### Saisie côté client (`/client/bookings/new`)
- Bouton "📍 Utiliser ma position" → `navigator.geolocation.getCurrentPosition()` (timeout 10 s)
- Reverse-geocode via **Nominatim OpenStreetMap** (gratuit, no API key) — header obligatoire `User-Agent: DogUniverse/1.0`
- Erreurs gérées : code 1 (denied), code 2 (unavailable), code 3 (timeout) → toast warning
- Coordonnées validées Zod (`lat: -90..90`, `lng: -180..180`, tous nullables)
- Persistance dans `tx.taxiDetail.create` au sein de la transaction de création de booking

### Navigation côté admin (`/admin/reservations/[id]`)
`src/components/admin/TaxiNavigationButton.tsx` — affiché uniquement si `serviceType === 'PET_TAXI'`. Sections séparées pickup + dropoff.
- **Google Maps** : `https://maps.google.com/?daddr={lat},{lng}`
- **Waze** : `https://waze.com/ul?ll={lat},{lng}&navigate=yes`
- Fallback (adresse texte sans coords) : `https://www.google.com/maps/search/?api=1&query={encodeURIComponent(addr)}`

### Geofencing (heartbeat chauffeur)
`POST /api/taxi/[token]/heartbeat` — à chaque ping GPS du chauffeur, si `pickupLat/Lng != null && trip.status === 'DRIVER_EN_ROUTE'` :
- `< 100 m` → `taxi:arrived_alert:{bookingId}` Redis NX EX 3600 → notif `TAXI_ARRIVED` au client
- `< 1000 m` (else if) → `taxi:near_alert:{bookingId}` Redis NX EX 3600 → notif `TAXI_NEAR_PICKUP`
- Wrappé `try/catch` → **fail-open** : Redis down → flag retourne `true` (possible doublon, accepté). Heartbeat ne fail jamais à cause du geofencing.

### Helpers
- `src/lib/geo.ts` → `haversineDistance(lat1, lng1, lat2, lng2): meters` (5 tests Vitest)
- `src/lib/cache.ts` → `tryAcquireFlag(key, ttl)` SET NX EX (fail-open)
- `src/lib/notifications.ts` → `createTaxiNearPickupNotification()` + `createTaxiArrivedNotification()` (bilingual fr/en)

### TYPE_CONFIG client (`NotificationsClient.tsx`)
| Type | Icon | Couleur |
|---|---|---|
| `TAXI_NEAR_PICKUP` | Car | gold |
| `TAXI_ARRIVED` | MapPin | green |

### Décisions
- **Nominatim vs Mapbox** : Nominatim choisi tant que volume < 1k req/jour (gratuit, fair-use 1 req/s). Migrer vers Mapbox/Google Geocoding si scale.
- **`if/else if` 100m/1km** : volontaire — si 1km manqué et chauffeur direct <100m, ARRIVED tire seul. Si 1km déjà envoyé, ARRIVED tire indépendamment (clés Redis distinctes).
- **Fail-open partout** : heartbeat est dans le chemin critique du chauffeur, jamais bloquer.

---

## HISTORIQUE

L'historique complet des sessions de travail et décisions techniques (sécurité, perf, architecture) est consigné dans [HISTORY.md](./HISTORY.md).

**Décision-clé toujours active : Soft-delete via filtres explicites `deletedAt: null`**

---

### 2026-05-04 — Sprint 3 refactoring : services, god-files, URL state, i18n centralisé, E2E

**Commits sur `claude/review-markdown-files-fV2pU` :**

1. **`notification-messages.ts` (Task 4)** — `src/lib/notification-messages.ts` : 25 factories de messages FR/EN centralisées. Type `MessageFactory = (data: Record<string, string>) => LocalizedMessage`. `src/lib/notifications.ts` réduit de 709 à ~390 lignes (-46%) — toutes les fonctions gardent les mêmes signatures exactes.

2. **Découpe god-file admin réservation (Task 2)** — `src/app/[locale]/admin/reservations/[id]/page.tsx` : 820 → ~550 lignes via 4 sous-composants server :
   - `BookingClientSection.tsx` — carte client + WhatsApp tracking conditionnel
   - `BookingPetsSection.tsx` — liste animaux avec liens
   - `BookingInvoiceSection.tsx` — facture principale + supplément extension
   - `BookingServiceSection.tsx` — type/dates/durée + tableau d'items additionnels + raison annulation
   - Suppression de 4 imports inutilisés : `formatMAD`, `WhatsAppButton`, `RecordPaymentButton`, `CreateInvoiceFromBookingButton`

3. **URL step state wizard réservation (Task 3)** — `src/app/[locale]/client/bookings/new/page.tsx` : `useState(step)` → `searchParams.get('step')` + `router.push(?step=N, { scroll: false })`. `setStep` compatible signature `number | (prev) => number` — 0 call site modifié. Bouton retour navigateur fonctionnel entre les étapes.

4. **E2E specs (Task 5)** — `e2e/totp.spec.ts` + `e2e/loyalty-claims.spec.ts` : skip gracieux (`test.skip()`) si secrets absents, même pattern que specs existantes.

5. **Task 1 (service layer)** — Vérification confirmée : `POST /api/bookings` délègue déjà `createBookingTx`, `runWithSerializableRetry`, `validateTaxiSlot`, `validateBoardingTaxiAddons` vers `booking-client.service.ts`. Aucune modification nécessaire.

**Règle architecturale : `notification-messages.ts` vs `notifications.ts`**
- `notification-messages.ts` : données pures (pas d'import Prisma, pas d'effets). Testable unitairement.
- `notifications.ts` : orchestrateur (importe Prisma, `createNotification`). Importe les messages depuis le module de données.
- Tout nouveau type de notification → ajouter une factory dans `notification-messages.ts`, appeler depuis `notifications.ts`.

**Règle URL state wizard**
- États de navigation (étape courante) → `useSearchParams` + `router.push` (bookmarkable, back button)
- États éphémères (loading, error, submitting, field values) → `useState` local

---

### 2026-05-04 — Sprint 4 : NPS / mobile sidebar / FK RESTRICT / Arabic / dashboard stats

**2 commits sur `claude/review-markdown-files-fV2pU` :**

1. **`feat(reviews)`** — Modèle `Review` Prisma (`bookingId @unique`, `rating 1-5`, `comment?`). API `POST /api/reviews` (client) + `GET /api/admin/reviews` (admin, paginé, filtres rating/sort). Cron `review-requests` (quotidien 10h, lock Redis, dédupliquer par REVIEW_REQUEST existant). Email template `review_request` bilingue. Composants `ReviewModal.tsx` + `ReviewButton.tsx` dans `src/components/client/`. Badge "Donnez votre avis" sur les réservations COMPLETED sans avis dans `/client/history`. Page `/admin/reviews` (Server Component, étoiles SVG, pagination, filtres). KPI note moyenne 30j sur le dashboard admin (`Promise.all` existant). Lien "Avis clients" dans `AdminSidebar` (icône `Star`). `REVIEW_REQUEST` dans `TYPE_CONFIG` client. Migrations SQL : `20260504_review` + `20260504_restrict_client_fk`. FK `onDelete: Restrict` sur `Booking.clientId`, `Invoice.clientId`, `LoyaltyGrade.clientId` (bloque hard-delete d'un User avec données).

2. **`feat(i18n): arabe RTL`** — Locale `ar` dans `routing.ts` + `request.ts`. `messages/ar.json` (traductions complètes nav, auth, landing, dashboard, bookings, invoices, notifications, profile, admin). `dir="rtl"` conditionnel dans `[locale]/layout.tsx`.

**TÂCHE 2 (mobile sidebar)** : déjà implémentée dans le code de base — `AdminSidebar.tsx` inclut depuis longtemps le hamburger, l'overlay et le slide-in drawer mobile (`mobileOpen` state). Aucune modification nécessaire.

**Décisions techniques :**
- `Review.bookingId @unique` : garantit un seul avis par réservation sans race condition.
- Cron `review-requests` distinct de `reminders` : fréquences et logiques différentes, séparation des responsabilités.
- `onDelete: Restrict` (pas Cascade) sur FK User → préserve l'intégrité comptable ; le soft-delete reste la voie normale.
- Locale `ar` avec `dir="rtl"` sur `<div>` wrapper (pas sur `<html>`) pour compatibilité avec le Server Component root layout.

---

### 2026-05-02 — Session sécurité P0 + quick wins + PWA + calendrier disponibilités

**Commits sur `main` :**

1. **P0 sécurité (3 fixes)** — IDOR sur notes admin (`/api/admin/clients/[id]/notes` : vérification `role === 'CLIENT'` avant accès). Injection SMS sanitisée (`/api/admin/clients/[id]/sms` : strip control chars + regex whitelist). Step-up auth sur danger route (`/api/admin/danger` : bcrypt compare + rate-limit 3/h + logs audit).

2. **CI fix** — `secrets.*` invalide dans les `if:` GitHub Actions → pattern `env: MIGRATE_DB_URL: ${{ secrets.DATABASE_URL }}` au niveau job + `if: env.MIGRATE_DB_URL != ''`.

3. **Quick wins sécurité** — `CRON_SECRET` requis en prod (Zod `env.ts`). Complexité password unifiée via `strongPassword()` dans `validation.ts` (register, passwordChange, resetPasswordConfirm, admin-create). `take: 1000` sur `billedByCategory` (défense DoS/OOM Lambda). HSTS déjà présent (confirmé, pas de changement).

4. **`feat(pwa)`** — manifest, SW, offline page, icons 192+512, PWAInstaller, layout meta tags.

5. **`feat(calendar)`** — `GET /api/availability`, `AvailabilityCalendar` component, admin calendar page, intégration booking client.

6. **`fix(tests)`** — `birthday-notifications.test.ts` : mock `notification.findMany` (batch dedup remplacé `findFirst`), mock `enqueueSms` (remplace `sendSMS` direct). 306 tests verts.

**Décisions techniques :**
- **`withSchema` Zod wrapper** : `src/lib/with-schema.ts` — wrapper générique pour routes Next.js 15 (async params + body validation, formatZodError unifié).
- **Services booking** : `src/lib/services/booking-admin.service.ts` + `booking-client.service.ts` + `booking-errors.ts` — extraction logique métier hors des routes (BookingError avec code → HTTP status map).
- **Indexes DB** : migration `20260502_indexes_composites` — `Notification(type, createdAt)`, `Booking(status, startDate)`, `Booking(status, endDate)`.
- **Audit full god-mode** : Morocco = marché ouvert (0 concurrence directe identifiée), 2FA = plus gros gap sécurité, multi-tenancy = bloquant fundability SaaS.

---

### 2026-05-01 — Session billing month default + diag CA Taxi

**3 commits sur `main` :**

1. **`44255dd fix(billing)`** — Forward-port du fix `b12dd80` absent de la branche `claude/work-in-progress-8MYIG` (divergence antérieure au commit). Ajout `monthStart`/`monthEnd` + `statsDateFrom`/`statsDateTo` toujours définis, `paymentStatsWhere` scopé sur la période, label `· mai 2026` affiché quand pas de filtre.

2. **`8d1f0e4 diag(metrics)` puis `403c193 chore(metrics)`** — Diagnostic temporaire `console.error(JSON.stringify(...))` dans `billedByCategory` pour investiguer "CA Taxi = 0". Logs Vercel ont confirmé : mai n'avait que DU-2026-0027 avec 2 items BOARDING et zéro PET_TAXI. Pas un bug : l'utilisateur n'avait pas enregistré la ligne. Logs retirés après confirmation.

3. **`2ec0d1e merge`** — Merge `claude/work-in-progress-8MYIG` → `main`.

**Décisions techniques :**
- **Diagnostic via `console.error` structuré** : pattern utile sans accès direct à la DB Supabase. À retirer dès la cause confirmée.
- **Branch divergence** : toujours vérifier `git diff main -- <file>` avant de re-débugger un fix supposément en prod — peut être absent par divergence.

---

### 2026-04-30 — Session audits sécurité P0→P4 + cache + addon-request fix

**8 commits sur `main` :**

1. **`e002cce` `fc13917` fix(build)** — Vercel 250 MB Lambda limit : `serverExternalPackages: ['ioredis', 'bullmq', 'opossum', '@prisma/client', '@react-pdf/renderer', 'sharp']` + `outputFileTracingExcludes` (`.git/**`, `.next/cache/**`, sentry CLI plugins, playwright). Diagnostic via analyse locale des `.nft.json` : root cause = `.git/objects` tracé dans chaque Lambda.

2. **`3c97136` fix(security) P0 (4 fixes)** — Privilege escalation guard sur `PATCH /api/admin/clients/[id]` (vérifie `target.role === 'CLIENT'` avant mutation, sinon ADMIN pouvait PATCH un SUPERADMIN). XSS sur noms d'animaux dans `email.ts` (escapeHtml appliqué via `safePets` dans helpers). Validation `totalPrice` dans `PATCH /api/bookings/[id]` (range 0–1M, NaN guard). `invalidateLoyaltyCache(userId)` câblé sur les 3 chemins de mutation grade.

3. **`045c04b` fix(p1) (5 fixes)** — Audit logs sur DELETE photo + DELETE contract (`STAY_PHOTO_DELETED`, `CONTRACT_DELETED` avec snapshot URL/storageKey/version). Atomicité `prisma.$transaction` sur claim approval (status update + notification commit ensemble, email post-commit fire-and-forget). Rate-limit `rgpd` bucket (5/h) sur `/api/user/export` + `/api/user/anonymize` via `RATE_LIMITED_ROUTES_ANY_METHOD`. N+1 fix sur `/admin/clients` (Prisma `groupBy` sur invoices PAID + Map<clientId, total>). `Idempotency-Key` sur POST /api/bookings (Stripe pattern, SET NX EX 24h, 409 sur replay).

4. **`ede2149` fix(p2) (10 fixes)** — `deletedAt: null` sur pets (admin clients GET + list). Cap `findMany` : loyalty claims (200), invoices (200), stay photos (500), admin notes (100), revenue summaries (120), contract remind (200). Masquage email dans logs contract-remind. Validation longueur 5000 chars sur `messageFr`/`messageEn` (POST notifications). `logAction(NOTIFICATION_SENT)` sur création message admin.

5. **`3ec7b07` `13e7e66` fix(addon-request)** — Bug : section "Demandes de services supplémentaires" absente sur fiche admin malgré badge sidebar. Cause : `distinct: ['metadata']` + `orderBy: { createdAt: 'desc' }` invalide en Prisma 5 + PostgreSQL (DISTINCT ON exige fields distinct en tête de ORDER BY). Fix final : query par `userId: session.user.id` + `type: 'ADDON_REQUEST'` (index userId, fast), parse + filter par `meta.bookingId === id` en JS (indépendant du format JSON), déduplication par `requestId` via Set. Logs diagnostiques conditionnels (`raw > 0 && parsed === 0` → dump compteurs + sample metadata).

6. **`ad8761d` perf(cache)** — `src/lib/cache.ts` (Upstash REST, fail-open). Cache câblé : capacity limits (5 min, bypass tx), loyalty grade per userId (5 min), notif unread count per userId (30 s, auto-invalidate via `createNotification`), admin pending+claims counts via `unstable_cache` tag `admin-counts` (30 s). Invalidation : `revalidateTag('admin-counts')` sur POST/PATCH bookings + claims, `invalidateNotifCount(userId)` sur PATCH /read et /read-all + dans le tx.notification.create de admin/loyalty/claims [id].

7. **`fcd2c66` fix(p3-p4) (6 fixes)** — Mask email cron contract-reminders. Bucket `addonRequest` (10/h) dans middleware. Runtime guard `typeof === 'object'` + `meta.bookingId === id` avant cast Record dans rate-limit check addon-request. Composite rate-limit key IP+userId : `auth()` dans middleware → `u:{userId}` si session, sinon IP, try/catch fail-safe. Mask email/phone + log `err.message` dans `lib/queues/index.ts` (PII safe). Zod schemas (`emailJobSchema`, `smsJobSchema`) dans workers/processors → throw → BullMQ retry × 3 → DLQ si payload corrompu.

**Décisions techniques :**
- **Cherry-pick stratégie** : feature branch `claude/fix-kanban-pet-taxi-status-7UzR7` divergeait de main avec 9 conflits. Au lieu de merge, cherry-pick sélectif des P0+P1 vers main + création stub `loyalty-server.ts` no-op (remplacé plus tard par cache réel dans `ad8761d`).
- **`distinct + orderBy` Prisma 5** : abandonné au profit de query simple + déduplication JS. Plus robuste, indépendant du format de sérialisation JSON.
- **Per-user rate-limit** : `auth()` dans middleware accepté malgré coût (1 décryptage JWT par requête rate-limited), justifié par fix d'un vrai bypass (VPN/IP rotation).
- **Cache `getCapacityLimits(client)`** : signature préservée pour bypass cache si appelé dans `$transaction` Serializable (snapshot consistency requis).

**Skippés avec justification :**
- Soft-delete User : déféré dans CLAUDE.md (cohérence)
- ContractModal ESC handler : intentionnel, le gate force la signature
- error.tsx per-segment admin : déjà `/admin/error.tsx`, per-route over-engineering pour P3
- Dialog aria-label fallback : Radix gère via `DialogTitle`, fallback générique `"Dialog"` pire que rien
- Sentry `startSpan` sur API routes : ouvert dans RISQUES CONNUS, séparé en P4

### 2026-04-28 — Session email template + E2E CI fix

**2 commits sur `claude/fix-kanban-pet-taxi-status-7UzR7` :**

1. **`fix(ci): e2e secrets step-level env + graceful skip`** — `.github/workflows/ci.yml` : env secrets dupliqués au niveau step `Run Playwright tests` (garantie explicite en plus du job-level). `e2e/helpers/auth.ts` : `requireEnv()` passe de `throw new Error()` à `test.skip()` — CI devient vert sans secrets. `e2eSecretsAvailable()` exporté pour guards `beforeEach` dans `login.spec.ts` et `contract.spec.ts`.

2. **`feat(email): booking_validated — dates range + companion names + animal species line`** — `src/lib/email.ts` : helpers `joinNames` / `joinNamesEn`, `buildAnimalLine` (stratégie singleGroup), `_companionFr/En` avec noms, `_dateRangeFr/En`, `_animalLineFr/En`. Call sites mis à jour : `api/admin/bookings/[id]/route.ts` et `api/bookings/[id]/route.ts` passent `pets[]` en 4ème arg à `getEmailTemplate`.

**Décisions techniques :**
- `buildAnimalLine` : virgule intra-groupe si multi-espèces (évite `"Max et Luna (chiens) et Mimi (chat)"` ambigu)
- Noms animaux **non échappés** via `escapeHtml` — accents/tirets marocains OK
- `fmtLocale = 'fr-MA' | 'en-GB'` pour `toLocaleDateString` — cohérent avec le reste du codebase (Maroc, jour en premier)

### 2026-04-29 — Session BullMQ async job queues

**1 commit sur `claude/fix-kanban-pet-taxi-status-7UzR7` :**

**`feat(bullmq): async job queues + bull board monitoring`** —
- `src/lib/redis-bullmq.ts` : connexion IORedis singleton pour BullMQ (TCP Upstash, ≠ REST). Options requises : `maxRetriesPerRequest: null`, `enableReadyCheck: false`, `enableOfflineQueue: false`. `isBullMQConfigured()` pour fail-safe.
- `src/lib/queues/index.ts` : Queue singletons `email`/`sms`/`dlq`. Helpers `enqueueEmail()` et `enqueueSms()` avec fallback direct si Redis down. JobId pattern `${bookingId}:${type}` pour déduplication.
- `src/workers/processors.ts` : `processEmailJob()` + `processSmsJob()` (routing via `to === 'ADMIN'`).
- `src/app/api/workers/process/route.ts` : cron toutes les minutes — Workers BullMQ éphémères (max 10 jobs/queue, 55s timeout). DLQ archiving dans le handler `worker.on('failed')`.
- `src/app/api/admin/queues/route.ts` : GET stats (SUPERADMIN) + POST retry.
- `src/app/[locale]/admin/queues/page.tsx` + `QueueMonitorClient.tsx` : UI monitoring avec compteurs, jobs échoués, bouton "Rejouer".
- `vercel.json` : ajout du cron `* * * * *` pour `/api/workers/process`.
- Intégration dans `POST /api/bookings` et `PATCH /api/admin/bookings/[id]` : tous les `sendEmail().catch()` / `sendSMS().catch()` / `sendAdminSMS().catch()` remplacés par `enqueueEmail()` / `enqueueSms()`.

**Décisions techniques :**
- IORedis TCP (pas REST) obligatoire pour BullMQ — Lua scripts + MULTI/EXEC non supportés par l'API REST Upstash
- Fail-open à l'enqueue (fallback direct) mais fail-closed à l'exécution (retry 3× + DLQ)
- Workers éphémères (créés/fermés par le cron) plutôt que workers persistants (incompatible Vercel serverless)
- `SmsJobData.to: string | null` — null skip silencieux (cohérent avec `sendSMS(null)` → `return false`)

### 2026-04-28 — Session capacité + sécurité + cron idempotence

**4 commits sur main :**

1. **`feat(capacity)` b048aed** — `src/lib/capacity.ts` + check dans `POST /api/bookings` + toast client `CAPACITY_EXCEEDED` + migration SQL seed `capacity_dog=20 / capacity_cat=10`. PENDING compte dans l'occupancy (prévention race condition).

2. **`fix(rgpd)` b5110f3** — Sentry : `sendDefaultPii: false` sur tous les configs (server, edge, client, instrumentation-client) + `beforeSend` filtrant `event.user.email`, `event.user.ip_address`, `request.headers.cookie/authorization`, `request.cookies` sur server + edge.

3. **`security` aa65550** — Suppression de `src/app/api/admin/bootstrap-superadmin/route.ts` (privilege escalation endpoint — permettait de créer un SUPERADMIN via POST non authentifié, conditionné à `NODE_ENV !== 'production'` mais risque réel).

4. **`feat(cron)` 9336123** — `src/lib/cron-lock.ts` (Redis SET NX EX, fail-open) + guard sur les 3 crons (`reminders`, `birthday-notifications`, `contract-reminders`).

**Décisions techniques :**
- Clés capacity conservées `capacity_dog` / `capacity_cat` (existantes dans UI/dashboard) plutôt que renommées `capacity.maxDogs` (aurait cassé les pages analytics/settings)
- Fail-open sur Redis : meilleure UX (rappel manqué < lock raté) — déduplication DB = filet de sécurité

### 2026-04-05 — Session audit sécurité Supabase

**2 vulnérabilités corrigées :**

1. **Contrats PDF publics permanents** (HIGH) : les contrats signés (signature manuscrite, nom, email, IP) étaient stockés avec `getPublicUrl()` → URL permanente et publique accessible sans authentification. Corrigé : architecture deux buckets — `uploads` (public, photos) + `uploads-private` (privé, contrats/documents). `uploadBufferPrivate()` + `createSignedUrl()` ajoutés dans `supabase.ts`. Les endpoints `GET/POST /api/contracts/sign` retournent une URL signée (1h). `ClientContract.pdfUrl` rendu nullable (déprécié). Migration SQL `20260405_private_storage` à exécuter sur Supabase.

2. **Upload type non whitelisté** (MEDIUM) : `/api/uploads` acceptait n'importe quelle string comme `uploadType` sans validation. Corrigé : whitelist `VALID_UPLOAD_TYPES` avec fallback sur `'pet-photo'`.

### 2026-03-20 — Session audit sécurité complet (round 2)

**7 vulnérabilités corrigées (audit offensif) :**

1. **CSV Formula Injection** (HIGH) : `escapeCsv()` dans `api/admin/invoices/export` préfixe `'` devant `=`, `+`, `-`, `@` — empêche l'exécution de formules Excel/LibreOffice à l'ouverture du fichier.

2. **CSV Export status non whitelisté** (HIGH) : whitelist ajoutée avant passage à Prisma dans l'export.

3. **Invoice PATCH status non whitelisté** (HIGH) : `api/invoices/[id]` valide `body.status` contre `['PENDING', 'PAID', 'CANCELLED']` avant update Prisma.

4. **Booking PATCH — client modifiait totalPrice/dates** (HIGH) : chemin CLIENT dans `api/bookings/[id]` totalement isolé — uniquement `status: 'CANCELLED'` + `cancellationReason` (max 500 chars). `IN_PROGRESS` ajouté dans `VALID_STATUSES` chemin admin.

5. **Notifications limit non borné** (MEDIUM) : borné à `Math.min(..., 100)` — DoS DB impossible.

6. **Admin client PATCH sans validation** (MEDIUM) : `name`/`phone` validés, trimmés, slicés dans `api/admin/clients/[id]`.

7. **Bootstrap SUPERADMIN timing attack** (LOW) : comparaison via `timingSafeEqual` + SHA-256.

### 2026-03-20 — Session sécurité (hardening complet)

**Corrections appliquées (10 fichiers) :**

1. **Whitelist enums Prisma** : les paramètres `status`, `serviceType`, `grade` passés en query string sont désormais validés contre une liste blanche avant d'être transmis à Prisma. Empêche toute injection d'opérateurs Prisma via l'URL.
   - Fichiers : `api/admin/bookings`, `api/admin/clients`, `api/bookings`, `api/invoices`

2. **XSS emails corrigé** : fonction `escapeHtml()` ajoutée dans `src/lib/email.ts`. Tous les champs `data.*` passent par cette fonction avant d'être injectés dans le HTML des templates. Les URLs (`resetUrl`, `loginUrl`) sont exemptées de l'échappement.

3. **Magic bytes MIME** : `src/lib/upload.ts` valide désormais le type réel du fichier via les octets magiques (signature binaire) — JPEG, PNG, WebP, GIF, PDF. Un fichier `.exe` renommé en `.jpg` sera rejeté. Le MIME détecté côté serveur est utilisé pour le stockage (remplace le `file.type` client-contrôlable).

4. **Rate limiting étendu** : middleware `src/middleware.ts` couvre maintenant aussi :
   - `POST /api/bookings` → 20 requêtes/h par IP
   - `POST /api/uploads` → 30 requêtes/h par IP

5. **CSP + remotePatterns** : `next.config.mjs` mis à jour — `img-src` restreint à `*.supabase.co` (plus de `https:` large). `remotePatterns` configuré pour `next/image` (chemin `/storage/v1/object/public/**`).

6. **Logs SMS dépiistés** : numéro de téléphone masqué dans les logs dev (`+212****67`). Message tronqué à 30 caractères.

7. **Race condition register** : `POST /api/register` attrape le code Prisma `P2002` (unique constraint violation) et retourne proprement `EMAIL_TAKEN` au lieu d'une erreur 500.

### 2026-03-10 — Session Board + Stepper

**Corrections et fonctionnalités :**

1. **`IN_PROGRESS` absent de `VALID_STATUSES`** : bug bloquant — les transitions "Chauffeur en route", "Dans nos murs", "Animal à bord" retournaient 400. Corrigé dans `PATCH /api/admin/bookings/[id]`.

2. **Board actionnable** : `ReservationsKanban.tsx` refactorisé avec boutons de transition contextuels par pipeline, mise à jour optimiste, logique centralisée.

3. **Stepper client** : fiche réservation client transformée avec progression visuelle verticale adaptée au type de service. Lecture seule côté client.

4. **Auto-refresh fiche client** : `AutoRefresh` component pour les réservations actives (30s) — contournement du Server Component statique.

5. **Validation taxi complétée** : le taxi standalone n'avait aucune validation dimanche/horaires côté JS (seulement les attributs HTML `min/max`). Validation JS + backend ajoutée.

### 2026-03-08 — Session principale

**Décisions d'architecture :**

1. **Upload → Supabase Storage obligatoire en prod** : le filesystem Vercel est éphémère. `upload.ts` détecte la présence de `SUPABASE_URL` pour choisir la stratégie. Le bucket Supabase doit s'appeler `uploads` avec les sous-dossiers `pets/`, `documents/`, `stays/`.

2. **`dateOfBirth` rendu obligatoire** : décision métier — l'anniversaire automatique n'est possible que si la date est connue. Tous les formulaires (client + admin) bloquent la soumission sans cette date.

3. **Seuil SILVER à 4 séjours conservé** : décision confirmée après analyse — 4 séjours ≈ 1 an de fidélité (1/trimestre), bon équilibre motivation/accessibilité. Ne pas remonter à 6 ou 8.

4. **QR code sur carte membre** : encode `du:client:{clientId}`. Utile à l'accueil pour accès rapide à la fiche client depuis un scan. Couleur du QR adaptée au grade.

5. **Avantages en deux catégories** : `claimable: false` (affiché, automatique) vs `claimable: true` (bouton "Réclamer", crée un `LoyaltyBenefitClaim`). Cette séparation est dans le type `GradeBenefit` dans `loyalty.ts`.

6. **Refus de réclamation = raison obligatoire** : l'admin doit justifier tout refus (`rejectionReason` non-null si status `REJECTED`). Validé côté API et côté UI.

**Problèmes résolus :**

- **Photos invisibles** : causé par écriture filesystem sur Vercel (éphémère). Résolu par branchement sur Supabase Storage.
- **Prisma sans DB locale** : la DB locale (`localhost:5432`) est inaccessible dans l'environnement de travail. Solution : `prisma generate` fonctionne sans connexion, migrations créées manuellement en SQL.
- **`loyaltyBenefitClaim` non reconnu par Prisma** : après ajout du modèle au schema, toujours relancer `npx prisma generate` (sans connexion DB) pour régénérer le client TypeScript.

---

### 2026-04-30 — Session Phase 3 perf + audit sécurité

**3 commits sur `main` :**

1. **`perf(phase3)`** — Optimisations Prisma et RSC :
   - `admin/bookings/[id]` : 2 boucles `for await invoiceItem.update()` → `Promise.all` (dates edit + extension approve)
   - `admin/clients/[id]` GET : include 4 niveaux (`bookings→bookingPets→pet`) remplacé par `select` ciblé + caps `take:100/200`
   - `admin/notifications/page.tsx` : converti en Server Component (Prisma direct, 0 waterfall) + `AdminNotificationsClient.tsx` pour les interactions
   - `admin/profile/page.tsx` : converti en Server Component + `AdminProfileClient.tsx` pour les formulaires

2. **`fix(security)` — 3 caps `take()` manquants** :
   - `invoices/export` : `take: 10_000` (DoS mémoire sur export illimité)
   - `pets/[id]/weight-history` : `take: 500`
   - `taxi-trips/[id]/tracking` : `take: 500` sur le batch cleanup GPS

**Décisions techniques :**
- **Admin pages RSC** : pattern systématique désormais — `page.tsx` Server Component (auth + Prisma), `*Client.tsx` pour les parties interactives. Évite le spinner + waterfall useEffect.
- **Audit sécurité** : CRITICAL/HIGH majoritairement faux positifs (loyalty claims GET avait déjà le check ADMIN/SUPERADMIN, revenue-summary avait déjà `take:120`). Seuls 3 caps `take()` manquants confirmés réels.
- **Promise.all dans transactions Prisma** : safe — le client `tx` supporte les opérations concurrentes dans une transaction interactive.

L'extension Prisma `$extends` de soft-delete a été revertée (commit `3477025`) car incompatible avec le Vercel Edge Runtime (`middleware.ts → auth.ts → prisma.ts` ⇒ `MIDDLEWARE_INVOCATION_FAILED`). Solution conservée : 57 filtres `{ deletedAt: null }` explicites dans les `findMany` / `findFirst` sur `User`, `Pet`, `Booking`. Ces filtres sont **intentionnels et obligatoires** — ne jamais les supprimer. Helper `notDeleted()` dans `src/lib/prisma-soft.ts` pour les nouveaux appels.
