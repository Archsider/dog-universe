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

## VERSIONS STACK (2026-04-28)

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
| Capacity `excludeBookingId` non câblé | OUVERT | Un admin qui prolonge un séjour verra sa propre réservation compter dans l'occupancy — faux positif possible. À câbler dans l'endpoint d'extension de réservation. |
| E2E Playwright | RÉSOLU | Secrets GitHub configurés, tests opérationnels en CI |
| Migration `20260405_private_storage` | À vérifier | Contrats PDF privés — si pas exécutée, contrats encore publics |
| Soft-delete User/Pet | DÉFÉRÉ | Booking soft-delete (`deletedAt`) est en place ; User/Pet délibérément déféré |

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

## HISTORIQUE ET DÉCISIONS CLÉS

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
