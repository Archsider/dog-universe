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
LOYALTY_UPDATE | PET_BIRTHDAY
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

## RÈGLES FORMULAIRES ANIMAUX

**`dateOfBirth` est OBLIGATOIRE** sur tous les formulaires (client et admin) depuis la session du 2026-03-08.
- Validation JS en frontend (toast d'erreur explicite)
- Champ marqué `*` dans le label
- Raison : calcul automatique de l'âge + anniversaires automatiques

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

## VERSIONS STACK (2026-04-30)

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
| Vitest | 4.1.5 (119 tests unitaires) |

**Pattern Next.js 15 params** : toujours `params: Promise<{ locale: string }>` + `const { locale } = await params` (async — pattern obligatoire sur main).

---

## ACTIONS MANUELLES EN ATTENTE

### 1. Migration SQL Supabase — capacity defaults
Exécuter dans le SQL Editor de Supabase :
```sql
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('capacity_dog', '20', NOW()), ('capacity_cat', '10', NOW())
ON CONFLICT ("key") DO NOTHING;
```
Fichier : `prisma/migrations/20260428_capacity_defaults/migration.sql`
Note : les clés existent déjà avec valeur `'50'` dans `DEFAULT_SETTINGS` du code → ce seed évite le fallback hardcodé de 50.

### 2. Variables d'env Vercel à ajouter
- `UPSTASH_REDIS_REST_URL` — URL REST Upstash (cron-lock)
- `UPSTASH_REDIS_REST_TOKEN` — token Upstash (cron-lock)
Sans ces vars, le cron-lock est fail-open (crons s'exécutent, déduplication DB seule).

**BullMQ (TCP, différent des vars REST ci-dessus) :**
- `UPSTASH_REDIS_HOST` — hostname TCP Upstash (ex: `polished-xxx.upstash.io`)
- `UPSTASH_REDIS_PORT` — port TLS (défaut `6379`)
- `UPSTASH_REDIS_PASSWORD` — password TCP Upstash
Sans ces vars, BullMQ est désactivé → les emails/SMS sont envoyés directement (fallback).

### 3. Secrets GitHub pour E2E Playwright
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
| Migration `20260405_private_storage` | CODE OK — BUCKET À VÉRIFIER | Code-side confirmé : `uploadBufferPrivate` + `createSignedUrl` utilisés, `pdfUrl String?` nullable, aucun appel `getPublicUrl` sur contrats. Risque résiduel : bucket `uploads-private` absent de Supabase → upload échoue en 500 (pas de régression silencieuse vers public). Vérification manuelle Supabase : `SELECT COUNT(*) FROM "ClientContract" WHERE "pdfUrl" IS NOT NULL;` doit retourner 0 (aucun contrat legacy public). |
| Soft-delete User/Pet | DÉFÉRÉ | Booking soft-delete (`deletedAt`) est en place ; User/Pet délibérément déféré |
| Sentry instrumentation API | OUVERT | Aucun `Sentry.startSpan()` sur les hot paths (`POST /api/bookings`, `PATCH /api/admin/bookings/[id]`) — observabilité limitée sur la latence DB |

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

## HISTORIQUE

L'historique complet des sessions de travail et décisions techniques (sécurité, perf, architecture) est consigné dans [HISTORY.md](./HISTORY.md).

**Décision-clé toujours active : Soft-delete via filtres explicites `deletedAt: null`**

L'extension Prisma `$extends` de soft-delete a été revertée (commit `3477025`) car incompatible avec le Vercel Edge Runtime (`middleware.ts → auth.ts → prisma.ts` ⇒ `MIDDLEWARE_INVOCATION_FAILED`). Solution conservée : 57 filtres `{ deletedAt: null }` explicites dans les `findMany` / `findFirst` sur `User`, `Pet`, `Booking`. Ces filtres sont **intentionnels et obligatoires** — ne jamais les supprimer. Helper `notDeleted()` dans `src/lib/prisma-soft.ts` pour les nouveaux appels.
