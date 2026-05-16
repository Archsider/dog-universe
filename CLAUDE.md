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
| `AddonRequest` | Demande d'addon sur une réservation existante (remplace le scan `Notification.metadata` — PR #22) |
| `GuardianEvent` | Évènement Sentry traité par l'AI Guardian (classification + action) — voir section AI GUARDIAN SENTRY |
| `Heartbeat` | Ping de santé écrit par le cron `heartbeat` (rétention 30 j) — voir section UPTIME SELF-MONITORING |
| `FeatureFlag` | Flag DB-backed (kill-switch + rollout % + targetRoles + whitelist) — voir section FEATURE FLAGS |

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

## /ADMIN/RESERVATIONS — SLIDE-OVER PANEL (depuis 2026-05-12)

Panneau de détail "classe mondiale" 720px desktop / 100vw mobile, déclenché par `?booking=<id>` dans l'URL.

### Architecture
- **URL state** : `router.replace(?booking=id)` — bookmarkable, pas de `useState`
- **Lazy-loading** : `next/dynamic({ ssr: false })` — panel jamais rendu côté serveur
- **SSR pre-fetch** : si `?booking=` dans l'URL initiale, `PanelWrapper` (Server Component) fetch la `BookingDetail` et passe `initialData` au panel
- **Adjacent pre-fetch** : panel fetch les IDs adjacents en background pour navigation instantanée ↑/↓
- **Focus trap** : `useFocusTrap` — Tab/Shift+Tab cyclent dans le panel
- **Body scroll lock** : `document.body.style.overflow = 'hidden'` pendant que le panel est ouvert

### Fichiers clés
```
src/types/booking-detail.ts                      — types sérialisables (pas d'imports Prisma)
src/app/api/admin/bookings/[id]/detail/route.ts  — GET endpoint (ADMIN/SUPERADMIN)
src/app/[locale]/admin/reservations/
  _hooks/
    useBookingNavigation.ts    — prev/next/index depuis orderedIds (pure useMemo)
    usePanelKeyboard.ts        — Esc/↑K/↓J/E/? avec garde focus INPUT/TEXTAREA
    useDebouncedSave.ts        — 800ms debounce + idle→saving→saved→idle
    useFocusTrap.ts            — Tab/Shift+Tab cycling dans containerRef
  _components/
    BookingDetailPanel.tsx     — orchestrateur principal (lazy-loaded)
    BookingDetailHeader.tsx    — sticky header : close + prev/next + ref link
    BookingDetailContent.tsx   — 5 sections + footer actions + CloseStayDialog
    BookingSection.tsx         — section collapsible (état dans localStorage)
    InlineEditField.tsx        — textarea transparent → visible on focus + auto-save
    BookingActions.tsx         — CTA contextuel par status/serviceType
    KeyboardHints.tsx          — overlay des raccourcis (? trigger)
    PanelSkeleton.tsx          — skeleton animate-pulse pendant le fetch
    sections/
      OverviewSection.tsx      — status pill + grille 2 colonnes
      PetsSection.tsx          — cards pet avec alertes allergie/médicaments
      InvoiceSection.tsx       — facture principale + supplémentaire + live total
      HistorySection.tsx       — timeline verticale des actions
      NotesSection.tsx         — notes éditable inline + dernier message admin
```

### Raccourcis clavier
| Touche | Action |
|---|---|
| `Esc` | Fermer le panel |
| `↑` / `K` | Réservation précédente |
| `↓` / `J` | Réservation suivante |
| `E` | Focus sur le champ notes |
| `?` | Afficher les raccourcis |

### Règles à respecter
- **Ne jamais utiliser `router.push` pour le panel** — toujours `router.replace` (évite l'historique de navigation)
- **`BookingSection` id doit être stable** — le localStorage key est `panel-sections:{id}`
- **`InlineEditField` PATCH target** : `PATCH /api/admin/bookings/[id]` avec body `{ notes: string }`
- **`CloseStayDialog` est le seul point d'entrée** pour COMPLETED depuis IN_PROGRESS — ne jamais patcher `status=COMPLETED` directement
- **`orderedIds`** — fourni par `PanelWrapper` server component depuis le même `where`/`orderBy` que la vue active

---

## /ADMIN/RESERVATIONS — ARCHITECTURE PAR HORIZONS (depuis 2026-05-12)

Refonte "outil de travail" type Mews/Toast — la page n'est plus une liste
plate, mais un workspace à 4 horizons temporels.

### URL
`?view=today|upcoming|in-progress|history` — défaut `today`.
Toggle Liste/Board déplacé en `?display=list|board` (s'applique aux tabs
upcoming/in-progress/history). La tab Today n'a pas de Board (elle est
task-oriented).

### Layout commun
- `PageHeader` — titre + sous-titre dynamique ("Mardi 12 mai · N animaux
  présents") + bouton "Nouvelle réservation"
- `TabBar` — 4 horizons avec badges count
- Toggle display visible sur les tabs upcoming/in-progress/history

### Tab `today` (default)
Rendue par `TodayClient.tsx` (orchestrateur client unique, modale +
mutations partagés sans prop drilling).
1. **Rangée 4 KPI cards cliquables** — Arrivées · Départs · Présents · À
   valider (amber si > 0). Scroll smooth vers la section + highlight 2s.
2. **Arrivées aujourd'hui** — `CONFIRMED`, `startDate=today`. Tri par
   `arrivalTime` croissant. Bouton "Check-in" → PATCH status=IN_PROGRESS.
3. **Départs aujourd'hui** — `IN_PROGRESS`, `endDate=today`. Bouton
   "Clôturer" → ouvre `<CloseStayDialog>`.
4. **Dans la pension** — `IN_PROGRESS`, chevauchant aujourd'hui, hors
   départs. Limité à 5 + bouton "Voir les N autres". Badges contextuels
   (Départ demain rouge / Dans N j amber / Walk-in J+N gris).
5. **En attente de validation** — `PENDING`, tri `createdAt` ASC.
   Boutons inline Refuser (modal raison min 10 chars) / Valider.
6. **À venir cette semaine** — résumé compact 1 ligne, cliquable → tab
   `upcoming`.

### Tab `upcoming`
`PENDING + CONFIRMED` avec `startDate > today`. Réutilise
`ReservationsList` (même UI/filtres internes), tri `startDate` ASC.

### Tab `in-progress`
`IN_PROGRESS` uniquement, tri `endDate` ASC. Réutilise `ReservationsList`.
Bouton "Clôturer" disponible via la fiche (le `CloseStayDialog` reste
le point d'entrée canonique).

### Tab `history`
Statuts terminaux : `COMPLETED | CANCELLED | REJECTED | NO_SHOW`.
- Filtres URL-syncs : `from`, `to`, `status`, `type` (gérés par
  `HistoryFilters.tsx`)
- Presets rapides : Mois en cours · Mois dernier · Trimestre · Année
- Stats sticky en haut : nombre · CA · taux annulation
- Lien CSV : `/api/admin/invoices/export?from=…&to=…`
- Tri par défaut : `endDate` DESC

### Composant clé `<CloseStayDialog>`
`src/app/[locale]/admin/reservations/_components/CloseStayDialog.tsx` —
modale réutilisable.
- Props : `booking { id, clientName, pets, startDate, endDate?,
  isOpenEnded, totalPrice }`, `pricing: PricingSettings`, `locale`
- Si `isOpenEnded` : champ `endDate` éditable → recalcul live `nights ×
  getPensionPriceNumber()` par animal
- Si normal : `endDate` readonly + `totalPrice` figé
- À confirmation : POST `/api/admin/bookings/[id]/checkout` (route
  existante, inchangée)
- Utilisée depuis : Today/Départs + Today via boutons inline. La fiche
  réservation continue à utiliser le `CheckoutBookingButton` legacy
  (wrap la même API).

### Helpers serveur
`src/app/[locale]/admin/reservations/_lib/today-queries.ts` :
- `loadTodaySnapshot(now?)` — renvoie `{ kpis, arrivals, departures,
  currentStays, pending, upcomingWeek }` en 5 queries parallèles
- `withLiveTotal()` enrichit chaque booking open-ended d'un `liveTotal`
  et `liveNights` (via `getPensionPrice()` + `differenceInCalendarDays`
  en TZ Casablanca)

### API polling
`GET /api/admin/bookings/today` — ADMIN/SUPERADMIN.
- `revalidate = 30` (Next.js fetch cache 30 s)
- Renvoie le même `TodaySnapshot` que le SSR initial
- Prévu pour un poller client (60 s) — pas encore branché dans
  `TodayClient` (à activer si besoin via `useEffect` + `setInterval`)

### Règles à respecter
- **Ne pas filtrer manuellement** par statut/type dans une nouvelle
  vue : passer par les tabs.
- **`CloseStayDialog` est l'unique point d'entrée** côté UI pour
  COMPLETED depuis IN_PROGRESS sur une pension. Ne jamais bricoler un
  PATCH `status=COMPLETED` manuel sans recalcul prix (sinon walk-in
  ouvert reste à 0 MAD).
- **`getPensionPriceNumber()` est l'unique source de tarif pension**
  côté front (pure, sans Prisma, safe en client component).

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

**Architecture trois buckets :**
| Fichier | Bucket | Accès |
|---|---|---|
| `pets/` (photos animaux) | `uploads` (public) | `getPublicUrl()` |
| `stays/` (photos séjour) | `uploads` (public) | `getPublicUrl()` |
| `documents/` (documents clients) | `uploads-private` (privé, whitelist MIME pdf+images) | `createSignedUrl()` |
| `contracts/` (contrats signés) | `uploads-private` (privé) | `createSignedUrl()` |
| `backups/` (dumps DB `.json.gz`) | `db-backups` (privé, **pas de whitelist MIME**) | `createSignedUrl()` |

**Pourquoi un bucket dédié pour les backups (2026-05-13)** : `uploads-private` a une whitelist MIME (pdf + images uniquement) qui rejetait les `.gz` avec `mime type application/gzip is not supported`. Bucket `db-backups` créé sans restriction MIME pour accueillir les dumps gzippés.

**Migration requise** : `prisma/migrations/20260405_private_storage/migration.sql` — à exécuter sur Supabase :
- Crée le bucket `uploads-private` (public=false)
- Rend `ClientContract.pdfUrl` nullable (champ déprécié — remplacé par `storageKey`)
- Ajoute une policy RLS bloquant tout accès anon/authenticated au bucket privé

**Variables d'env Supabase nécessaires en production :**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (défaut : `"uploads"`)
- `SUPABASE_PRIVATE_STORAGE_BUCKET` (défaut : `"uploads-private"`)
- `SUPABASE_BACKUPS_BUCKET` (défaut : `"db-backups"`)

---

## SAUVEGARDES DB (depuis 2026-05-13, PR #54/#55/#56)

### Architecture
```
src/lib/db-backup.ts       → runDbBackup() + listBackups() + getBackupBucket() + BACKUP_PREFIX
src/lib/backup-health.ts   → markBackupAttempt() + getLastBackupSuccess/Error (Upstash, fail-open, TTL 90j)
/api/cron/db-backup        → defineCron daily 03h UTC, lock Redis 'db-backup:YYYY-MM-DD'
/api/admin/backups/trigger → POST SUPERADMIN, **bypass du lock** (appelle runDbBackup() direct)
/api/admin/backups         → GET SUPERADMIN, retourne backups + diagnostics (lastSuccess/lastError/storageConfigured)
/api/admin/backups/download/[date] → GET SUPERADMIN, signed URL 15 min
/api/admin/backups/restore/[date]  → POST SUPERADMIN, additif + per-row fallback + ?dryRun=1
/admin/backups (BackupsClient.tsx) → UI : status banner + KPI strip + card grid + AlertDialog modals
```

### Règles d'or
- **Bucket dédié `db-backups`** (env `SUPABASE_BACKUPS_BUCKET`) — séparé de `uploads-private` (contrats) parce que la whitelist MIME des contrats rejetait les `.gz`. Le bucket `db-backups` n'a aucune restriction MIME.
- **`getBackupBucket()` est l'unique source de vérité** pour le nom du bucket — toutes les routes backup l'importent. Pour rechanger : un seul endroit à toucher.
- **Cron lock `daily` uniquement sur `/api/cron/db-backup`** — le trigger SUPERADMIN appelle `runDbBackup()` directement, sans `defineCron`. Sans ce bypass, tout clic après 03h UTC retournait silencieusement `{ skipped: true }`.
- **Upload `upsert: true`** + **content-type `application/octet-stream`** (universel, accepté partout).
- **Restore additif** : `createMany({ skipDuplicates: true })` puis fallback row-by-row si throw. Classification `inserted` / `skipped (P2002)` / `failed`. Les rows existants ne sont **jamais** écrasés.
- **Telemetry Redis** : chaque tentative (cron OU trigger) stamp `bk:last:ok` ou `bk:last:err` (TTL 90j). Surface dans `GET /api/admin/backups`.
- **Rétention 30 jours** dans `runDbBackup()` (rotation non-fatale : un échec de delete ne casse jamais le dump nouvellement uploadé).

### Tables exportées (caps)
User 50k, Pet 50k, Booking 100k, Invoice 100k, InvoiceItem 200k, Payment 100k, Product 5k, ClientContract 50k (metadata only — PDF dans Storage), InvoiceSequence 1k, LoyaltyGrade 50k, LoyaltyBenefitClaim 100k, Notification 10k (cap !), AdminNote 50k, ActionLog 50k, BookingItem 200k, BookingPet 200k, BoardingDetail 100k, TaxiDetail 100k, Vaccination 100k, Review 50k, AddonRequest 50k, Heartbeat 20k, `_app_migrations` 1k.

Voir `docs/BACKUP_RESTORE.md` pour le drill manuel + script de restauration destructif (staging only).

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
| `/api/cron/heartbeat` | Toutes les 5 min | Self-monitoring : ping `/api/health/ping`, écrit `Heartbeat`, alerte SMS SUPERADMIN si 3 KO consécutifs (PR #26) |
| `/api/cron/health-reconciliation` | Quotidien | Vérifie les invariants critiques (`Invoice.amount` vs `SUM(items.total)`, etc.) via `health-invariants.ts` (PR #23) |
| `/api/cron/refresh-revenue-mv` | Quotidien 02h UTC | Refresh complet de `monthly_revenue_mv` (complément du tick horaire `refresh-monthly-revenue`) (PR #22) |

**Protection :** header `x-cron-secret` vérifié contre `CRON_SECRET` (déjà défini sur Vercel).
Vercel l'injecte automatiquement via `Authorization: Bearer` pour ses propres crons.

### Worker BullMQ (depuis 2026-04-29)
| Route | Fréquence | Rôle |
|---|---|---|
| `/api/workers/process` | Chaque minute | Dépile et traite les jobs email + SMS des queues BullMQ |

Architecture asynchrone :
- **Notifications transactionnelles depuis 2026-05-07** : `sendEmailNow` / `sendSmsNow` (fire-and-forget direct, 3 retries 0s/1s/3s) pour les actions utilisateur (booking, validation, photo, claim, message, invoice). `enqueueEmail` / `enqueueSms` réservés aux crons batch (reminders, birthday, reviews, overdue, weekly). Voir `src/lib/notify-now.ts` + `docs/REALTIME_NOTIFICATIONS.md`. Raison : cron Vercel Hobby = dépilage 1×/min → latence inacceptable pour le transactionnel.
- Si Redis down au moment de l'enqueue (cron) → fallback direct (sendEmail / sendSMS)
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

**Pricing pension (verrouillé 2026-05-08) :** utiliser obligatoirement
`getPensionPrice()` de `src/lib/pricing.ts` (Decimal) ou
`getPensionPriceNumber()` de `src/lib/pricing-rules.ts` (number).
Ne JAMAIS coder un tarif pension en dur. Une ligne `InvoiceItem` BOARDING
**par animal** — pas de ligne combinée multi-animaux.

Règle métier (centralisée dans le helper) :
| Cas | Tarif/nuit |
|---|---|
| Chat | 70 MAD |
| Chien — séjour ≥ 32 nuits | 100 MAD |
| 2+ chiens | 100 MAD/chien |
| 1 chien seul, < 32 nuits | 120 MAD |

L'ordre d'évaluation est : `CAT → long_stay → multi → single`. Long stay
prévaut sur multi-chiens. Migration `20260508_fix_pension_pricing`
recale les lignes legacy en DB. Tests dans
`src/lib/__tests__/pricing.test.ts` (cas-limites + données réelles).

**Upsell & produits (verrouillé 2026-05-10) :** utiliser obligatoirement
`getMatchingProducts()` ou `getMatchingProductsForPet()` de
`src/lib/pet-profile.ts` pour toute recommandation produit. Ne JAMAIS
filtrer manuellement par espèce/âge dans les routes API.

Catégories cibles :
- `targetSpecies` : `DOG` | `CAT` | `BOTH`
- `targetAge` : `PUPPY` (<12 mois) | `JUNIOR` (12-23 mois) | `ADULT`
  (24-83 mois) | `SENIOR` (≥84 mois) | `ALL`

Le matching génère 4 OR par animal (espèce×âge | espèce×ALL | BOTH×âge
| BOTH×ALL) et trie par pertinence (SENIOR/PUPPY > JUNIOR > ADULT > ALL)
puis prix décroissant (upsell premium en premier). Catalogue Ultra Premium
+ Canvit (~70 produits) seedé via `20260510_seed_products_upsell` (stock=0
initial — Mehdi ajuste après réception). API endpoints :
`GET /api/(client|admin)/products/suggestions?bookingId=…`. UI :
`src/components/shared/UpsellSuggestions.tsx` (mode `client` / `admin`).
Tests dans `src/lib/__tests__/pet-profile.test.ts`.

---

## CONVENTIONS DE CODE

- **Langue des variables/fonctions** : anglais
- **Langue de l'UI** : fr/en via `next-intl` (toujours les deux)
- **Composants server** : pages Next.js par défaut (pas de `'use client'` sauf nécessaire)
- **Composants client** : préfixés `'use client'`, nommés avec suffixe `Manager`, `Button`, `Modal` si interactifs
- **Prisma** : toujours utiliser l'instance singleton de `src/lib/prisma.ts`
- **Migrations** : si DB locale inaccessible, créer le SQL manuellement dans `prisma/migrations/YYYYMMDD_nom/migration.sql` et fournir le SQL à exécuter sur Supabase
- **Zéro TypeScript errors** : toujours vérifier avec `npx tsc --noEmit` avant commit
- **Zéro lint errors** : `npm run lint` doit passer (les 4 règles `dog-universe/*` sont `error`, bloquent CI — voir GARDE-FOUS ESLINT)
- **Formatage monétaire** : toujours `formatMAD()` de `src/lib/utils`
- **Dates** : `formatDate()` ou `formatDateShort()` de `src/lib/utils`

### Règle Server Component / Client Component — utilitaires partagés
**Ne jamais exporter une fonction helper depuis un module `'use client'`.** Next.js 15 wraps tous les exports de ces modules en "client references" — les importer dans un Server Component provoque `"Attempted to call X() from the server but X is on the client"`.

Pattern correct : si un helper est utilisé à la fois par un Server Component et un Client Component, le placer dans un fichier neutre **sans directive** (ex: `format-month.ts`), importé par les deux.

Exemple : `src/app/[locale]/admin/billing/format-month.ts` (extrait de `BillingClient.tsx` pour cette raison).

---

## /ADMIN — DASHBOARD "COMMANDANT" (depuis 2026-05-16)

Cockpit opérationnel, **zéro chiffre financier**. Les KPIs argent restent
sur `/admin/billing` et `/admin/analytics`. Décision Mehdi : dashboard =
ce qui est actionnable maintenant, pas un état financier.

### Architecture

```
src/app/[locale]/admin/dashboard/
  page.tsx                  — orchestrateur 1 seul Promise.all via loadDashboardSnapshot()
  loading.tsx               — skeleton screens (pas spinner)
  _lib/
    queries.ts              — DashboardSnapshot + 10 section loaders en parallèle
    helpers.ts              — occupancyLevel/Percent, nextSevenCasaDays, upcomingBirthdays
    whatsapp.ts             — buildWhatsAppUrl + buildLongStayMessage + buildInactiveClientMessage
    labels.ts               — FR/EN dictionaries
  _components/
    PensionActuelleCard.tsx — barres occupation chiens/chats + couleur ≥70/≥90
    AValiderCard.tsx        — compteur PENDING + CTA, empty state vert si 0
    AujourdhuiCard.tsx      — 3 colonnes check-in/check-out/pet-taxi + empty 🌙
    Capacity7DaysChart.tsx  — 2 mini-graphs séparés chiens + chats (inline SVG bars)
    UpcomingCards.tsx       — Arrivées + Départs J→J+7 côte à côte
    BirthdaysCard.tsx       — 🎂 sans âge (décision UX : neutre pour vieux animaux)
    VaccinesCard.tsx        — expirations dans 30 jours
    LongStaysCard.tsx       — IN_PROGRESS > 21j + CTA WhatsApp "Contacter →"
    InactiveClientsCard.tsx — 6+ mois inactifs + CTA WhatsApp "Relancer →"
    CriticalInvariantsCard.tsx — uniquement si invariants:last:* critical > 0
    Skeletons.tsx           — ZoneNow/Week/Alerts skeletons
```

### 3 zones structurelles

| Zone | Cartes | Objectif |
|---|---|---|
| **1 — Maintenant** | Pension actuelle / À valider / Aujourd'hui | Action immédiate |
| **2 — Cette semaine** | Capacité 7j / Arrivées-Départs / Anniversaires | Anticipation J→J+7 |
| **3 — Alertes & rappels** | Invariants / Vaccins / Longue durée / Inactifs | Intelligence proactive |

Zone 3 n'est rendue que si **au moins une carte a du contenu** (zero-state global = section invisible).

### Règles métier durcies

- **IN_PROGRESS strict** pour "Pension actuelle" (état physique du kennel)
- **Activité client** = `max(Booking.startDate, Payment.paymentDate)` ; seuil inactif = 180 j Casa
- **Anniversaires** : fenêtre 7j Casa, exclure walk-ins, **pas d'âge affiché**
- **Vaccins** : `Vaccination.nextDueDate IN [today, today+30j]`, status='CONFIRMED', exclure walk-ins
- **Longue durée** : `Booking{status='IN_PROGRESS', startDate < today-21j}` strict ; cap 5
- **WhatsApp deep links** : `wa.me/<phone>?text=<encoded>`, fail-silent si phone manquant
- **Casa partout** : `startOfTodayCasa()`, `casablancaYMD()` — interdit `.getMonth()` sur Date
- **Pet Taxi today** : pivot sur `TaxiTrip` (pas `Booking.serviceType='PET_TAXI'`).
  Filtre `TaxiTrip.date = casablancaYMD(today)` en string YYYY-MM-DD (le
  champ est `String?` en DB) + `status NOT IN TAXI_TERMINAL_STATUSES` +
  `booking.status IN ('CONFIRMED','IN_PROGRESS')` + `booking.deletedAt IS
  NULL`. Capture **standalone + addon GO + addon RETURN** d'un coup. Sans
  ce pivot la query rate tous les bookings BOARDING avec addon taxi (bug
  livré PR #98, fix PR #101 — même cause racine que driver dashboard PR
  #68). Badge UI : ALLER (vert) / RETOUR (bleu) / COURSE (violet).
- **`TAXI_TERMINAL_STATUSES`** : `ARRIVED_AT_PENSION | ARRIVED_AT_CLIENT
  | COMPLETED | CANCELLED | REJECTED | NO_SHOW`. Reste alignée avec
  `HISTORY_TERMINAL_STATUSES` de `taxi-history.service.ts` (any new
  terminal added there should also be added here ; the lists exist
  separately to avoid an import cycle).

### Suppressions de cette refonte

- `src/app/[locale]/admin/dashboard/RevenueChartWrapper.tsx`
- `sections/DashboardActivity.tsx` (chart 12 mois Recharts)
- `sections/DashboardCheckInOut.tsx` (remplacé par AujourdhuiCard 3 colonnes)
- `sections/DashboardKpiList.tsx`, `DashboardLowerSections.tsx`, `SectionSkeleton.tsx`
- `_components/{AlertBanners,ClientInsights,MainKpis,ServiceRevenues}.tsx`
- Toutes les imports de `billedByCategory`, `totalCashCollected`, `cashByMonth` retirées de cette route

### Tests

`_lib/__tests__/helpers.test.ts` (24) + `whatsapp.test.ts` (12) = 36 tests.
- Boundary timezone Casa (00:30 Casa rolls day)
- Year wrap des anniversaires (Dec 31 → Jan)
- WhatsApp URL encoding + normalize phone (8+ digits min)
- Occupancy thresholds <70 / 70-89 / ≥90

### Lien financier footer

Discret en bas de page : "📊 Voir l'analyse financière complète →
/admin/billing". Si Mehdi veut un chiffre absolu, c'est là.

---

## GARDE-FOUS ESLINT (depuis 2026-05-16, Module 4-B)

Plugin local `eslint-plugin-dog-universe` (linké via `file:./eslint-rules`
dans `package.json`) — **4 règles `error` qui bloquent la CI** pour
empêcher la réintroduction silencieuse des 4 familles de bugs chassés
ces dernières semaines.

| Règle | Famille de bug |
|---|---|
| `no-getmonth-on-date-casa` | `.getMonth()` sur Vercel UTC retourne le mois précédent à minuit Casa |
| `no-money-tofixed` | `.toFixed()` sur Decimal perd la précision (cas Rita 120,10 vs 120,105) |
| `no-direct-payment-create` | `prisma.payment.create()` bypass de `recordPayment` (cache CA, cross-role, SMS OPS) |
| `no-prisma-date-without-helper` | `new Date()` dans une query Prisma sur colonne date |
| `no-direct-invoice-mutation` | `prisma.invoice.update` direct sur `paidAmount`/`amount`/`status`/`paidAt`/`version` — bypass de `recordPayment` (livré 2026-05-17, audit Kleppmann I3) |

### Pattern d'escape

```ts
// eslint-disable-next-line dog-universe/no-getmonth-on-date-casa -- OK: <reason>
const m = d.getMonth();
```

La justification après `-- OK:` est **convention obligatoire** : un
reviewer doit voir au premier coup d'œil pourquoi le site est safe.

### Fichiers exempts (file-level overrides dans `.eslintrc.json`)

- `**/__tests__/**`, `**/*.test.{ts,tsx,js}`, `e2e/**` — fixtures de RuleTester + tests métier qui doivent mentionner les patterns interdits
- `scripts/**`, `prisma/**` — outillage hors runtime production
- `eslint-rules/**` — le plugin lui-même (fixtures de tests)
- `src/lib/dates-casablanca.ts` + `src/lib/__tests__/dates-casablanca.test.ts` — implémentation et tests des helpers Casa (auto-whitelisté par la règle, pas via override)
- `src/lib/payment-allocation.ts` — implémentation canonique de `recordPayment` (auto-whitelisté par la règle)

### Fichiers entièrement client-side exemptés par `/* eslint-disable dog-universe/no-getmonth-on-date-casa */` au top

(Browser TZ = Casa pour Mehdi local — la règle ne s'applique pas à l'UI navigateur)

- Tous les `'use client'` qui font du calendar grid / chart axis / date picker UI
- Cf. liste complète dans `docs/ESLINT_RULES.md`

### Ajouter une nouvelle règle

Voir `docs/ESLINT_RULES.md` "Adding a new rule". Pattern : `RuleTester`
de `eslint` + parser `@typescript-eslint/parser` + vitest auto-pick.

---

## WALK-IN UI — FACTURE PAID-ON-THE-SPOT (depuis 2026-05-16)

Permet à Mehdi de saisir toutes ses factures walk-in (boutique +
services courts non réservés) avec création atomique d'une **résa
fantôme + facture + paiement** en une seule action. Cible : saisir
les factures historiques notées papier pour avoir le vrai CA réel.

### Endpoint

`POST /api/admin/walkin-invoice` — ADMIN / SUPERADMIN. Header
`Idempotency-Key` **obligatoire** (replays inside 24h renvoient
l'invoice existante via `Booking.idempotencyKey = "walkin:<key>"`).

**Body** :
```ts
{
  clientId?: string | null,             // null = anonyme
  clientName?: string | null,           // si anonyme, override clientDisplayName
  paymentDate?: string,                 // ISO, défaut now()
  paymentMethod: 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER',
  items: Array<{
    category: 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' | 'DISCOUNT',
    description: string,                // ≤ 200 chars
    quantity: number,                   // 1 ≤ q ≤ 9999
    unitPrice: number,                  // DISCOUNT exige < 0, sinon ≥ 0
  }>,                                   // 1 ≤ N ≤ 50
  notes?: string | null,                // ≤ 2000 chars
}
```

**Validation Zod** : refine cross-champ DISCOUNT ↔ unitPrice + total
net > 0 + au moins 1 item non-DISCOUNT si DISCOUNT présent.

**Flow atomique** (Prisma `$transaction`) :
1. Resolve `clientId` → l'id fourni OU find-or-create lazy de l'user
   générique `walkin-anonymous@dog-universe.local` (single row partagé)
2. Allocate invoice number via `InvoiceSequence` (`INSERT ... ON
   CONFLICT DO UPDATE RETURNING lastSeq`)
3. Créer fantôme `Booking` : `status='COMPLETED'`, `serviceType='BOARDING'`
   (cosmétique), `isWalkIn=true`, `source='WALKIN'`,
   `startDate=endDate=paymentDate`, `idempotencyKey='walkin:<key>'`
4. Créer `Invoice` : `bookingId`, `clientDisplayName` override si anonyme
   + nom libre, `periodDate=paymentDate`, status PENDING
5. `createMany` des `InvoiceItem`s avec mapping `category`
6. Commit la transaction

**Post-commit** (hors tx) :
- `recordPayment({ trustedAmount: true })` — total correct par
  construction, overpayment guard redondant. Helper Module 4-A reste
  l'unique path d'insertion Payment (cf. règle ESLint
  `no-direct-payment-create`).
- `sendSmsNow({ to: 'ADMIN' })` — pattern Site B
- `logAction(INVOICE_CREATED_WALKIN)` — audit trail
- Cache `revenue:YYYY:MM` invalidé par `recordPayment` automatiquement

### Idempotency

Header obligatoire — pas de back-compat avec absence. Replay :
`tryAcquireIdempotency` retourne `{ acquired: false }` → on lookup
`Booking.idempotencyKey = 'walkin:<key>'` et on renvoie
`{ replay: true, invoiceId, invoiceNumber }` sans rejouer la
transaction. Si la première tentative a crashé mid-tx (acquired vrai
mais aucun booking) → on laisse passer pour permettre re-création.

### Frontend

`src/components/admin/WalkinInvoiceModal.tsx` (~500L) — modal 3 étapes
lazy-loadé sur `/admin/billing` à côté de "Créer une facture" :

1. **Client** : switch existant (autocomplete via `ClientSearchSelect`)
   / anonyme (nom libre optionnel)
2. **Items** : multi-lignes (add/remove dynamique), catégorie +
   description + qty + unitPrice par ligne, total live calculé. DISCOUNT
   auto-normalise le signe du `unitPrice` (négatif). Validation client
   bloque "Suivant" si invalide.
3. **Paiement** : datepicker (default `todayCasaYmd()` via
   `casablancaYMD(new Date())` — règle Module 4-B respectée), 4 boutons
   radio méthodes, textarea notes optionnelles, total à encaisser en
   bandeau vert.

Submit → `POST /api/admin/walkin-invoice` avec `Idempotency-Key`
généré côté client (`crypto.randomUUID()` strip dashes, fallback
ts+random). Success → `setOpen(false)` + `router.refresh()` + event
`'toast'` dispatched sur `window`.

### Badge calendrier WALKIN

`CalendarBooking` shape étendu avec `isWalkIn?: boolean` + `source?:
string | null`. `DayCell.tsx` : chip violet `🛒 Walk-in` à la place
du chip status standard quand `isWalkIn=true || source='WALKIN'`. Le
`petsToday` count du header calendar **exclut les walk-ins** (pas
physiquement dans le kennel).

### Pas de migration DB requise

- `Booking.source` est déjà `String?` → on écrit `'WALKIN'` directement
- `Booking.isWalkIn` existe déjà (PR #75)
- `Invoice.clientDisplayName/Phone/Email` existent déjà (override
  pattern pour anonymes)
- `walkin-anonymous@dog-universe.local` lazily créé au runtime via
  find-or-create — pas de seed nécessaire

### Tests

`src/app/api/admin/walkin-invoice/__tests__/route.test.ts` — 11 tests :
- 403 si non-admin
- 400 si Idempotency-Key absent
- 400 si body malformé (Zod)
- 400 si total ≤ 0
- Happy path single-item : crée Booking + Invoice + Item + Payment,
  appelle recordPayment(trustedAmount=true), envoie SMS OPS,
  logAction
- Multi-items : sums correctly
- DISCOUNT line : total net respecté
- Rejet DISCOUNT-only (pas de positive item)
- Anonyme : lazy-create walkin-generic user, réutilise sur 2ᵉ call
- Idempotency replay : même key → même invoice sans re-créer
- Payment failure : surface 500 + invoice id pour recovery manuelle

### Garde-fous Module 4-B respectés

- `casablancaYMD()` pour year/month/day partout (pas `.getMonth()`)
- `formatMAD()` pour display (pas `.toFixed()`)
- `recordPayment()` unique path Payment (pas
  `prisma.payment.create()`)
- Aucun `new Date()` dans une query Prisma (date params explicites)

---

## CYCLE DE VIE RÉSERVATION — TIME PROPOSAL + CANCEL (depuis 2026-05-17)

Système classe mondiale pour la négociation de l'heure (arrivée pension +
addons taxi) entre admin et client, et la cancellation explicite avec
cascade. Source : audit produit 2026-05-17 — confusion "j'ai confirmé
la résa" vs "j'ai confirmé l'heure".

### Entité `TimeProposal`

```prisma
enum TimeProposalScope  { ARRIVAL | TAXI_GO | TAXI_RETURN }
enum TimeProposalStatus { PENDING | ACCEPTED | REJECTED | SUPERSEDED | CANCELLED }

model TimeProposal {
  id              String              @id @default(cuid())
  bookingId       String
  scope           TimeProposalScope
  time            String              // "HH:MM" Casa
  status          TimeProposalStatus  @default(PENDING)
  proposedBy      String              // userId
  proposedByRole  String              // 'CLIENT' | 'ADMIN' | 'SUPERADMIN'
  proposalNote    String?
  respondedBy/At/ByRole/Note (response trail)
  publicToken / publicTokenExpiresAt  // HMAC pour acceptation client par email
  booking         Booking             @relation(...)
}
```

**Source de vérité** = dernière `TimeProposal ACCEPTED` par `(bookingId,
scope)`. `Booking.arrivalTime` + `BoardingDetail.taxiGo/ReturnTime` gardent
leur sémantique "originally requested" pour audit produit.

### State machine

```
PENDING ──admin/client accept──>  ACCEPTED  (terminal-positive)
   │
   ├──admin/client reject──────>  REJECTED  (terminal-negative + reason)
   │
   ├──new proposal created─────>  SUPERSEDED (historique préservé)
   │
   └──cascade booking cancel──>   SUPERSEDED (cleanup auto)
```

Un seul PENDING vivant à la fois par `(bookingId, scope)`. Toute nouvelle
proposition supersede la précédente atomiquement (updateMany).

### Service layer (`src/lib/time-proposals.ts`)

- `createProposal(input)` : crée + supersede PENDING précédente. HMAC
  `publicToken` émis seulement si proposeur ADMIN/SUPERADMIN (le client
  recevra le lien email). 14j TTL.
- `acceptProposal` / `rejectProposal` : flip PENDING → terminal + clear
  publicToken (email link returns 410 Gone après).
- `supersedePendingForBooking(bookingId)` : cascade hook appelée par le
  cancel flow.
- `getConfirmedTime(bookingId, scope)` / `getCurrentProposal(...)` :
  read helpers.
- `verifyTimeProposalToken(token)` : HMAC SHA-256 + timingSafeEqual.
- Secret : `TIME_PROPOSAL_TOKEN_SECRET` (fallback `NEXTAUTH_SECRET`).

### API routes

| Route | Auth | Body | Description |
|---|---|---|---|
| `POST /api/admin/bookings/[id]/time-proposals` | ADMIN+ | `{action: 'propose'\|'accept'\|'reject', ...}` | Discriminated body |
| `POST /api/admin/bookings/[id]/cancel` | ADMIN+ | `{reason: ≥10 chars, silent?}` | Cancel + cascade |
| `POST /api/time-proposals/[token]/accept` | publicToken | — | Client accepte via lien email |
| `POST /api/time-proposals/[token]/reject` | publicToken | `{note: ≥10 chars}` | Client refuse via lien email |

Toutes les routes : `withSpan` instrumented, ADMIN cross-role gate
(ADMIN ne peut pas toucher SUPERADMIN-owned), version-lock 409 sur
cancel, server errors surfaced dans le toast (debug future-proof).

### Composants UI

- `src/components/admin/TimeProposalBanner.tsx` (~280 LoC) : 5 états
  visuels (no proposal / client PENDING / admin PENDING / ACCEPTED /
  idle). Inline propose form avec timepicker + note. Un banner par
  scope applicable (ARRIVAL toujours pour BOARDING ; TAXI_GO/RETURN
  quand addon enabled).
- `src/components/admin/CancelBookingModal.tsx` (~120 LoC) : AlertDialog
  avec textarea reason ≥ 10 chars + checkbox silencieux + bandeau
  cascade. Compteur en temps réel `{n}/10 caractères minimum`.
- `src/app/[locale]/time-proposals/[token]/page.tsx` + `PublicProposalClient.tsx` :
  page publique HMAC-protected (pas de login). UI accept/reject avec
  motif. Graceful 410/expiré.

### Intégration `ReservationActions.tsx`

- Nouveau bouton "Annuler la réservation" rouge dédié (visible si
  status ∈ {PENDING, CONFIRMED, IN_PROGRESS, WAITLIST, PENDING_EXTENSION})
- `patchStatus` intercepte CANCELLED/REJECTED → ouvre le CancelBookingModal
  au lieu d'échouer silencieusement sur l'API qui exige une raison
- Toast d'erreur surface le code serveur (`CAPACITY_EXCEEDED`,
  `VERSION_CONFLICT`, `CANCELLATION_REASON_REQUIRED`) au lieu d'un
  générique "Update error" — debug future-proof

### Auto-création initial proposal

`src/lib/services/booking-client.service.ts` `createBookingTx` : si le
demandeur fournit `arrivalTime` (ou `taxiGoTime`/`taxiReturnTime` avec
addon enabled), une `TimeProposal PENDING` est créée auto **dans la
même transaction Serializable** avec `proposedByRole='CLIENT'`. L'admin
voit immédiatement sur la fiche "Le client a proposé HH:MM" et peut
accepter ou contre-proposer.

### Notifications + Email

- 3 nouveaux types `Notification` : `BOOKING_TIME_PROPOSED`,
  `BOOKING_TIME_CONFIRMED`, `BOOKING_CANCELLED`
- 3 nouveaux templates email FR/EN : `booking_time_proposed` (avec
  CTA "Accepter [time]" pointant vers `/time-proposals/[token]`),
  `booking_time_confirmed`, `booking_cancelled`
- Helpers `createTimeProposedNotification` / `createTimeConfirmedNotification` /
  `createBookingCancelledNotification` dans `src/lib/notifications/booking.ts`
- Helpers admin-side `notifyAdminsBookingTimeAccepted/Rejected` dans
  `src/lib/notifications/booking-admin-notif.ts` (lazy-imported par
  les routes publiques)

### Migration data

`prisma/migrations/20260517_time_proposals/migration.sql` :
- Crée enums + table + 4 indexes + trigger updatedAt
- **Backfill retroactif** : toutes les réservations existantes avec
  `arrivalTime` non-null → `TimeProposal ACCEPTED` avec note "Retro-
  migration: pre-2026-05-17 booking — time considered confirmed by
  legacy convention". Idem pour les addon taxis avec `enabled=true`.
  IDs déterministes (`tp_legacy_arr_<bookingId>`) → idempotent.
- → **Aucun bandeau orange spam** sur les ~50 résas legacy en cours
  après deploy.

`down.sql` : DROP table + enums + DELETE _app_migrations row. Le re-up
régénère la backfill depuis les colonnes source.

### Tests (41 nouveaux, 1421 total)

- `src/lib/__tests__/time-proposals.test.ts` (18) : service layer
  (state machine + HMAC + role-aware emit + supersede cascade)
- `src/app/api/admin/bookings/[id]/time-proposals/__tests__/route.test.ts` (9) :
  propose/accept/reject + cross-role + supersede
- `src/app/api/admin/bookings/[id]/cancel/__tests__/route.test.ts` (6) :
  cancel + cascade count + silent mode + cross-role + terminal status
- `src/app/api/time-proposals/[token]/__tests__/route.test.ts` (8) :
  HMAC tamper rejection + expired + already-resolved 410

### Garde-fous Module 4-B respectés

- Pas de `prisma.payment.create` (paths money path canonique inchangés)
- Pas de `prisma.invoice.update` direct sur money fields
- Pas de `new Date()` dans Prisma where (toutes les dates passées
  via params explicites)
- Pas de `.getMonth()` Casa-derived
- Pas de `.toFixed()` sur money

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

### Walk-in Admin — Création flexible (depuis 2026-05-12)

`POST /api/admin/bookings` supporte 5 cas de walk-in réels :

| Cas | isOpenEnded | initialStatus | Particularité |
|---|---|---|---|
| Classique | false | IN_PROGRESS | Dates connues, chien déjà là |
| Durée ouverte | true | IN_PROGRESS | Date retour inconnue — clôture via CloseStayDialog |
| Rétroactif | false | COMPLETED | Séjour passé — `finalAmount` obligatoire, facture PAID créée |
| Taxi prise en charge | false | CONFIRMED | Pet Taxi — heure d'arrivée facultative |
| Combo taxi+ouvert | true | IN_PROGRESS | Taxi + pension ouverte |

**Champ DB :** `Booking.isWalkIn Boolean @default(false)` — distinct de `User.isWalkIn`.
Mapping: `booking.isWalkIn || booking.client.isWalkIn` dans les composants et l'API detail.

**Déduplication téléphonique :** si un client walk-in avec le même téléphone existe déjà (`User.isWalkIn=true, deletedAt=null`), on le réutilise sans créer de doublon.

**Règles de validation cross-champs (Zod refinements) :**
- `COMPLETED + endDate absent` → `END_DATE_REQUIRED_FOR_COMPLETED`
- `isOpenEnded + initialStatus=PENDING` → `OPEN_ENDED_CANNOT_BE_PENDING`
- `initialStatus=COMPLETED + finalAmount absent` → `FINAL_AMOUNT_REQUIRED`

**Capacité :** les walk-ins ouverts (`isOpenEnded=true`) sont vérifiés sur une fenêtre `WALKIN_DEFAULT_WINDOW_DAYS = 30` jours (advisory — warning, pas blocage).

**Clôture :** `CloseStayDialog` reste le point d'entrée unique pour COMPLETED depuis IN_PROGRESS.
Ne jamais patcher `status=COMPLETED` manuellement sans recalcul prix.

**Kanban :** badge "walk-in" gris sur les cartes + label "Walk-in ouvert" / "Open-ended stay" en italique amber à la place des dates.
**InvoiceSection :** banner amber "Facture en attente de clôture" quand `!invoice && isOpenEnded`.

### Contraintes Pet Taxi (front + back)
- **Dimanche interdit** : `isValidTaxiDate()` dans le formulaire client
- **Horaires 10h-17h uniquement** : `isValidTaxiTime()` dans le formulaire client
- Validation dupliquée côté backend dans `POST /api/bookings` :
  - `SUNDAY_NOT_ALLOWED` → 400
  - `INVALID_TIME_SLOT` → 400
- S'applique au taxi standalone ET aux addons taxi d'une pension

---

## VERSIONS STACK (2026-05-14)

| Package | Version |
|---|---|
| **Node (runtime CI)** | **22 LTS** (depuis PR #71 — `fs.promises.glob` exigeait Node 22+) |
| Next.js | **15.5.18** (depuis PR #71 — bump security `backport` tag, CVE high-severity DoS Server Components) |
| React | 19 |
| next-auth | 5.0.0-beta.25 (JWT, tokenVersion) |
| Prisma | 5.22.0 |
| next-intl | 4.9.2 (upgrade depuis 3.26 — GHSA-8f24) |
| @upstash/redis | 1.36.3 |
| @upstash/ratelimit | 2.0.8 |
| date-fns | 4.1.0 |
| Zod | 3.23.8 |
| @sentry/nextjs | (configuré server + edge + client + instrumentation-client) |
| Playwright | configuré, skip gracieux si secrets absents (`test.skip()` dans `beforeEach`), timeout CI 25 min (PR #71) |
| Vitest | 4.1.5 (**1046 tests** au 2026-05-14 — +17 dates-casablanca, +7 taxi-trip-finalize, +41 sms-policy, +17 sms-dedup, +19 notify-now, +17 taxi-gps-filter, +7 close-stay-total) |
| k6 | scripts dans `tests/k6/` (booking-concurrent, dashboard-perf, invoice-payment-race, taxi-heartbeat-stress) — exécution manuelle, séparée d'E2E (PR #21) |

**Pattern Next.js 15 params** : toujours `params: Promise<{ locale: string }>` + `const { locale } = await params` (async — pattern obligatoire sur main).

---

## ACTIONS MANUELLES EN ATTENTE

### ⚠️ Migration 20260512 — User(role, isWalkIn) index (2026-05-12)
À exécuter sur Supabase SQL Editor :
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_isWalkIn_idx" ON "User" ("role", "isWalkIn");
```
Sans cet index, les pages admin font un full table scan sur `User` à chaque requête (filter `role='CLIENT' AND isWalkIn=false`).

### ⚠️ Migration 20260512 — Booking.isWalkIn flag (2026-05-12)
À exécuter sur Supabase SQL Editor (fichier `prisma/migrations/20260512_walkin_booking_flag/migration.sql`) :
```sql
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Booking_isWalkIn_idx" ON "Booking"("isWalkIn");
```
Rollback via `down.sql` disponible. Sans ce champ, `Booking.isWalkIn` reste `false` pour toutes les réservations existantes (pas bloquant — fallback sur `User.isWalkIn`).

### ✅ Scalabilité DB — Supabase Transaction Pooler (PgBouncer) ACTIF (vérifié 2026-05-13)
**État** : `DATABASE_URL` Vercel pointe sur `pooler.supabase.com:6543` avec `?pgbouncer=true`. `DIRECT_URL` configurée sur port 5432 pour les migrations Prisma. `schema.prisma` correctement câblé (`url` + `directUrl`).
**Vérification** : `/admin/health` (SUPERADMIN) affiche désormais une carte "Pool Postgres" verte si OK / rouge si jamais la config drift. Endpoint backend `/api/admin/health` retourne `{ dbPool: { pooled, via, warning } }`.
**Runbook** : si besoin de changer un jour, voir `docs/PGBOUNCER.md`.

### 🟡 Gaps de consistency restants (non bloquants)
- **Auth guards dupliqués** : 32 routes admin utilisent encore le pattern `if (!session?.user || session.user.role !== ...)` au lieu de `requireRole(['ADMIN', 'SUPERADMIN'])` (`src/lib/auth-guards.ts`). Migration manuelle recommandée — chaque route doit être testée individuellement.
- **`notDeleted()` non utilisé** : 99 occurrences de `deletedAt: null` inline. Helper existe dans `src/lib/prisma-soft.ts` mais pas adopté.
- **`withSpan` / `withSchema` non uniformes** : certains crons et routes POST n'ont pas l'instrumentation/validation centralisée.
- **God-file** : `VaccinationSection.tsx` 696L à splitter en 3 (ViewSection, FormModal, DocumentList).

### ⚠️ Wave 1 (PR #75) — Cleanup SQL idempotent (2026-05-14)

Voir [`docs/wave-1-cleanup-sql.md`](./docs/wave-1-cleanup-sql.md) — à exécuter une fois la PR #75 mergée, dans l'ordre :

1. **§1.1 → §1.3** : merge des Pets dupliqués (re-link `BookingPet` à un survivor, soft-delete les autres). Une exécution par groupe de doublons. Optionnel **§1.4** : index unique partiel anti-race (`Pet_owner_name_species_active_unique`).
2. **§3.2** : cascade des `TaxiTrip` zombies vers leur statut terminal (OUTBOUND/STANDALONE → `ARRIVED_AT_PENSION`, RETURN → `ARRIVED_AT_CLIENT`).
3. **§4.2** : backfill des `TaxiTrip` manquants pour les boardings avec addon taxi déjà créés.
4. **Bloc de vérification** en bas du doc : chaque query doit retourner 0 rows quand tout est propre.

### ⚠️ Vercel — Suppression du projet orphelin `dog-universe-2btg` (2026-05-14, PR #71)

Le projet Vercel `archsiders-projects/dog-universe-2btg` échoue à chaque push depuis des mois (DATABASE_URL inaccessible, `ENETUNREACH` sur le pooler IPv6). Aucun impact prod (le vrai projet est `dog-universe`). Action : aller sur https://vercel.com/archsiders-projects/dog-universe-2btg/settings → tout en bas → **Delete Project**. Supprime le badge rouge permanent sur chaque PR.

### 🔧 DETTE TECHNIQUE — Migration Rollback Check (CI rouge, non bloquant prod)
La CI `migration-rollback-check.yml` échoue depuis `20260511_invoice_sequence` (PR antérieure). La migration crée une séquence Postgres qui dépend de la table `Invoice` ; lors du dry-run `up → down → up` sur DB vierge, la séquence ne peut pas être recréée dans l'ordre attendu. **N'affecte pas la prod** (la table Invoice existe en réel). À fixer dans une PR dédiée — soit en ajustant le `down.sql` de cette migration, soit en marquant la séquence comme dépendante de la table dans le bootstrap two-pass du workflow. Tous les autres rollback checks passent.

### ✅ Migrations 20260510 exécutées (2026-05-12)
- `prisma/migrations/20260510_product_upsell/migration.sql` — colonnes `targetSpecies`/`targetAge`/`imageUrl`/`weight`/`supplier` sur `Product` + CHECK + index. ✅
- `prisma/migrations/20260510_seed_products_upsell/migration.sql` — seed ~85 produits Ultra Premium + Canvit. ✅

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
| Tarif pension corrompu sur factures legacy | RÉSOLU (2026-05-08) | Migration `20260508_recover_v2_force_nights` : reconstruction `quantity = nights` du booking + recompute `Invoice.amount`. Safety net pour ré-équilibrer le BOARDING item d'écart manquant si `paidAmount > amount`. |
| Drift `Invoice.amount` vs `SUM(items.total)` | RÉSOLU (2026-05-09) | Trigger PG `trg_recompute_invoice_amount` AFTER INSERT/UPDATE/DELETE sur `InvoiceItem` recalcule `Invoice.amount` automatiquement. CHECK `paidAmount <= amount + 0.01`. Plus aucune écriture incohérente possible. |
| Dropdown clients vide nouvelle facture | RÉSOLU (2026-05-08) | `CreateStandaloneInvoiceModal` utilisait `<select>` statique avec prop `clients` non passée. Remplacé par `ClientSearchSelect` (autocomplete via `/api/admin/clients/search`). |
| Dropdown produits dans nouvelle facture | RÉSOLU (2026-05-08) | `<datalist>` HTML alimenté par `/api/admin/products` avec auto-fill prix + catégorie + `productId`. POST `/api/invoices` décrémente le stock atomique en transaction. |
| Recommandations upsell par espèce + âge | LIVRÉ (2026-05-10) | `getMatchingProducts()` dans `lib/pet-profile.ts` (4 OR par animal, scoring SENIOR/PUPPY > JUNIOR > ADULT > ALL). Composant unique `UpsellSuggestions` mode client/admin. Catalogue Ultra Premium + Canvit ~85 produits seedé via migration. |
| Validation + checksum migrations SQL | LIVRÉ (2026-05-11, PR #20) | `db-migrate.mjs` valide statiquement (DROP/DELETE sans WHERE, taille > 100l), enregistre SHA-256 dans `_app_migrations`, warn sur drift. CI `migration-check.yml` lance dry-run sur postgres:16-alpine. |
| Multi-tenant scaffolding mort | RÉSOLU (2026-05-11, PR #21) | Modèle `Tenant` et colonnes `tenantId` retirés (jamais utilisés, ajoutaient du bruit). Migration `20260512_drop_tenant_scaffold` (irréversible, marqueur `@rollback: not-applicable`). |
| k6 load tests | LIVRÉ (2026-05-11, PR #21) | 4 scénarios dans `tests/k6/` (booking concurrent, dashboard perf, invoice payment race, taxi heartbeat stress). Exécution manuelle, **séparée d'E2E** (objectifs et runtimes différents — k6 n'a rien à faire dans le pipeline PR). |
| MV partout pour analytics monthly | LIVRÉ (2026-05-11, PR #22) | `revenueByCategoryProrata` lit `monthly_revenue_mv` en priorité, fallback live si MV vide pour ce mois. POST `/api/admin/refresh-revenue-mv` (SUPERADMIN) on-demand + cron daily 02h UTC. |
| Scan fragile `Notification.metadata` pour addons | RÉSOLU (2026-05-11, PR #22) | Modèle dédié `AddonRequest`. POST `/api/bookings/[id]/addon-request` insère une row + rate-limit via `prisma.addonRequest.count`. Notifications legacy non migrées (par spec). |
| Spans Sentry + invariants DB | LIVRÉ (2026-05-11, PR #23) | `withSpan` + `markCronRun` dans `src/lib/observability.ts`. Page `/admin/health` (SUPERADMIN) + cron `health-reconciliation` quotidien. `health-invariants.ts` vérifie cohérences (Invoice.amount, paidAmount, items orphelins). |
| Rollback migrations | LIVRÉ (2026-05-11, PR #24 + #28) | Convention `down.sql` ou marker `@rollback: not-applicable`. Runner `db-rollback.mjs`. CI `migration-rollback-check.yml` fait `pg_dump -s` before/after up→down sur 90 derniers jours, bootstrap two-pass pour DB pré-peuplée. |
| AI Guardian Sentry | LIVRÉ (2026-05-11, PR #25) | Webhook → HMAC → sanitize PII → Claude Haiku classify → action (issue GH / notif SUPERADMIN / silence). Voir section AI GUARDIAN SENTRY. Migration `20260513_guardian_events`. |
| Uptime self-monitoring + page /status | LIVRÉ (2026-05-11, PR #26) | Cron `heartbeat` */5min, alerte SMS SUPERADMIN sur 3 KO consécutifs (dédup 1h). Page publique `/status` (uptime 24h/7j/30j + chart latence inline-SVG). Migration `20260513_heartbeat`. |
| Feature flags DB-backed | LIVRÉ (2026-05-11, PR #27) | Modèle `FeatureFlag` + `isFeatureEnabled` async sticky bucketing SHA-256, cache Redis 60s (négatif aussi caché). Page `/admin/feature-flags` (SUPERADMIN) + hook `useFeatureFlag`. Voir section FEATURE FLAGS. |
| CI rollback-check fail sur DB vide | RÉSOLU (2026-05-11, PR #28) | Bootstrap two-pass : applique toutes les migrations < CUTOFF pour avoir un état complet, puis boucle up→down sur les récentes. Insère aussi dans `_app_migrations` pour cohérence avec `db-rollback.mjs`. |
| Sentry noise + crash SSR booking detail | RÉSOLU (2026-05-11, PR #29) | Filtre Sentry pour AbortError, ResizeObserver, "Failed to fetch" (fetch annulé par navigation, pas un bug). Hardening `client/bookings/[id]` : `filter(bp => bp.pet)` avant map (pet soft-deleté → `bp.pet null` faisait crasher), `bp.pet.name?.[0] ?? '?'`. |
| CSP report endpoint flood | RÉSOLU (2026-05-11, PR #30) | `/api/csp-report` générait ~10K events "error" / jour Vercel. `console.warn` au lieu de `console.error` (Vercel classe par méthode console, pas par payload). Rate-limit Upstash 30 req/min/IP, fail-open. |
| GPS taxi distance corrompue | RÉSOLU (2026-05-14, PR #67) | Un trajet ~5 km loggait 64,4 km. Filtre 6 portes dans `src/lib/taxi-gps-filter.ts`, throttle client 3 s, suppression de l'option `distanceFilter: 5` (option React Native ignorée par le web). Endpoint admin `/recompute-distance` pour réparer les trips historiques. ADR-0006. |
| Driver dashboard à 0 km | RÉSOLU (2026-05-14, PR #68) | Pivot sur `Booking.serviceType='PET_TAXI'` ratait tous les boardings avec addon. Réécrit pour pivoter directement sur `TaxiTrip`. Plus le PDF preview figé (Chrome cache `?view=1` → `Cache-Control: no-store`) et CloseStayDialog qui ignorait la remise (priorité `invoiceAmount > totalPrice`). |
| SMS doublons + burst | RÉSOLU (2026-05-14, PR #69 + #70) | 13 appels directs à `sendSMS`/`sendAdminSMS` contournaient la dédup. Race `read → send → write`. `tryReserveSmsSend` INSERT-first via contrainte unique Postgres (atomique par construction). Garde ESLint `no-restricted-imports` empêche réintroduction. Normalisation téléphone dans la dédup. Dashboard `/admin/health` 4 KPI SMS. ADR-0007. |
| Flake `diagnostics.test.ts` | RÉSOLU (2026-05-14, PR #70) | `mockReturnValueOnce` sur `getEmailQueue` quand la route l'appelle 2× dans le même `Promise.all` → race 50/50 selon quelle promise résout en premier. Remplacé par `mockReturnValue` (sans Once). |
| CI rouge permanent (route.ts, bundle, audit, E2E) | RÉSOLU (2026-05-14, PR #71) | Node 20 → 22 (scripts utilisent `fs.promises.glob` exigeant Node 22+). Bundle budget 280→560 KB honnête (Next 15.5 + React 19 baseline = 510 KB). Next 15.5.15 → 15.5.18 (tag `backport`) pour CVE high-severity DoS Server Components. E2E timeout 15→25 min. Projet Vercel orphelin `dog-universe-2btg` documenté pour suppression manuelle. |
| SMS la nuit chez les clients | LIVRÉ (2026-05-14, PR #74 ouverte) | Politique respectueuse : ADMIN/OPS → send-now ; Walk-in + COMPTA → skip ; Standard + COMPTA + 21h-9h Casa → defer BullMQ jusqu'à 9h. Toggle UI sur PaymentModal. ADR-0008. |
| Wave 1 bugs métier (5 bugs prod) | LIVRÉ (2026-05-14, PR #75 ouverte) | (1) Pet dupliqué ×5 → dédup idempotente + meilleure surface d'erreur dans bouton Delete. (2) "Départ demain" pour J+2 → `src/lib/dates-casablanca.ts` (UTC+1 fixe Maroc). (3) Course "EN COURS" zombie → cascade `Booking COMPLETED → TaxiTrip terminal` + filtre défensif driver. (4) Marie Lagarde manquante → `createBookingTx` crée maintenant les TaxiTrip avec BoardingDetail dans la même transaction. (5) CA/À venir faux → downstream de #3 + #4 + filtres défensifs. Cleanup SQL idempotent dans `docs/wave-1-cleanup-sql.md` (manuel). |
| Observabilité Sentry serveur muette | RÉSOLU (2026-05-15, PR #79 → #85) | Aucun event API/RSC/cron n'arrivait dans Sentry depuis des semaines (seulement client-side). 3 bugs cumulatifs : (A) deux `instrumentation.ts` root vs `src/` (Next 15 prend src/) avec `assertProductionEnv()` et `onRequestError` séparés ; (B) `withSentryConfig.tunnelRoute: '/monitoring'` → Vercel external rewrite renvoyait 403 silencieux ; (C) **cause finale** : intégration Vercel-Sentry parasite `sentry-celeste-bucket` (désinstallée) override de `NEXT_PUBLIC_SENTRY_DSN` avec une DSN pointant sur un projet Sentry qui n'existait plus. Fix : consolidation `src/instrumentation.ts` unique, suppression `tunnelRoute`, `src/lib/sentry-dsn.ts` source unique (env → fallback hardcodé), désinstallation intégration parasite Vercel + reset DSN à la valeur canonique. Voir `docs/SENTRY_INTEGRATION.md`. |
| Widget "Email il y a X min" gelé | RÉSOLU (2026-05-15, PR #86) | `/admin/diagnostics` affichait "Email il y a 3059 min" alors que les emails partaient. Cause : `lastEmailSentIso()` lisait BullMQ `getCompleted(0,0)` — qui ne reflète QUE le dernier batch cron. Depuis 2026-05-07, les emails transactionnels passent par `sendEmailNow` (direct SMTP, bypass queue) ⇒ widget gelé sur la dernière exécution cron. Fix : nouveau module `src/lib/email-health.ts` (Redis key `email:last:sent`, miroir de `backup-health.ts`), `markEmailSent()` appelé depuis le chokepoint unique `sendEmail()` capture les DEUX chemins (queue + direct), `lastEmailSentIso()` lit Redis. Pas de migration ni de table EmailLog (overkill pour le besoin actuel). |
| Suppression message admin envoyé par erreur | LIVRÉ (2026-05-15, PR #87) | Notification `type='ADMIN_MESSAGE' \| 'END_STAY_REPORT'` gagne `deletedAt` + `deletedBy`. `DELETE /api/admin/bookings/[id]/messages/[messageId]` soft-delete + idempotent + audit `ActionLog` avec `payloadBefore` (corps complet). Vue client filtre `deletedAt: null`. Vue admin garde la trace : message barré + label "Supprimé par X le Y". Gating par type → impossible de soft-delete une notif système (STAY_REMINDER, etc.). Migration `20260515_notification_soft_delete_and_end_stay_report` (idempotente). Voir `docs/CLIENT_MESSAGES.md`. |
| Rapport fin de séjour structuré | LIVRÉ (2026-05-15, PR #87) | Nouvelle table `EndStayReport` (`bookingId`, `clientId`, `formData` JSON, `finalMessage`, `sentAt`, `sentBy`, `version`). CTA banner sur `/admin/reservations/[id]` quand `COMPLETED` ou (`IN_PROGRESS` && `endDate ≤ today+1`). Page `/admin/reservations/[id]/end-report` avec form 5 sections (behaviour/food/sleep/activities/health) + checkboxes + free text + closing note + live preview. Pure helper `src/lib/end-stay-report.ts → buildEndStayReportMessage` partagé entre preview et serveur — zero risque de drift. Modal anti-drame avant envoi (nom client + email visibles). Pipeline `Notification(type='END_STAY_REPORT') + sendEmailNow`. `version: 1` (manuel) ; 2/3 réservés pour AI step 2. Voir `docs/END_STAY_REPORT_AI.md` pour le scoping IA. |
| Cron `purge-anonymized` jamais fire | LIVRÉ (2026-05-15, PR #88) | Vercel n'avait pas re-syncé les schedules après l'ajout du cron dans `vercel.json`. Le manuel trigger SUPERADMIN existait déjà. Cause root : pas de signal actif quand un cron ne fire jamais. Fix : `src/lib/cron-freshness.ts` classifie tous les `CRON_NAMES` à chaque tick du heartbeat (*/5min). Stamp `cron:first-seen:<name>` Redis à la 1ère observation `lastRun === null`. Au-delà de `STALENESS_THRESHOLD_HOURS = 48h`, SMS broadcast SUPERADMIN (dedup 24h via flag Redis). Clear l'anchor quand le cron finit par tourner. Doc complète `docs/CRON_RECOVERY.md` (runbook 4 étapes : confirmer config → manual trigger → forcer re-sync Vercel → escalade). Pour purge-anonymized spécifiquement : exécuter une fois `POST /api/admin/cron-trigger/purge-anonymized` (SUPERADMIN) ⇒ stamp markCronRun + désarme watchdog. |
| Invariants comptables auto-vérifiés | LIVRÉ (2026-05-15, PR #90 — Module 1) | `src/lib/health-invariants.ts` étendu de 4 à 10 invariants : SUM(allocatedAmount) vs paidAmount, SUM(Payment) vs paidAmount, allocatedAmount > total, paidAt manquant sur facture fully paid, MV refresh < 2h, JS vs MV pour le mois courant (catch drift Sémantique A). Cron horaire dédié `/api/cron/invariants-check` (vercel.json `10 * * * *`) — persiste chaque résultat dans Redis `invariant:last:<key>` (TTL 7j), SMS SUPERADMIN immédiat sur les critical (dedup 24h par invariant), ActionLog `INVARIANT_VIOLATION_DETECTED` pour audit permanent. Dashboard `/admin/guardian/invariants` (SUPERADMIN) avec tri critical > warning > green > never-run. Type `CronPeriod` étendu de `'hourly'`. Tolérance 0.01 MAD partout. |
| Tests régression métier canoniques | LIVRÉ (2026-05-15, PR #91 — Module 2) | `src/lib/__tests__/business-regression.test.ts` — 7 cas canoniques bloquants en CI (npm test = vitest run, déjà run par .github/workflows/ci.yml). 38 assertions au total. Couvre : (1) Rita DU-2026-0030 sous Sémantique A, (2) timezone Casa 22:30/23:30 UTC boundary, (3) loyalty tier boundaries 1/3/4/9/10/19/20 + revenu PLATINUM, (4) capacity boundary PARAMÉTRIQUE (pas de "50" hardcodé — la formule `newPets > limit - current` est testée à toute valeur N, dog ET cat), (5) soft-delete leak via getMonthlyInvoicesWhere case 2 (FIX inclus : `booking.deletedAt: null` ajouté), (6) payment allocation déterministe Sémantique A (acompte n'alloue rien, multi-items ordre-indépendant), (7) booking CANCELLED exclu du CA en attente. TODO documenté pour CANCELLED+payment (Case 1 caisse-prime nécessite refacto + alignement MV — hors-scope). |
| Bug TZ — round 2 : `revenueByCategoryProrata` cache key et fallback summary | RÉSOLU (2026-05-16, PR Bug TZ analytics) | **Constat** : post-merge PR #96, l'invariant CA JS vs MV est passé au vert mais `/admin/analytics` section "Performance par activité — 2026" continuait à afficher avril (PENSION 37030 / TAXI 2170 / TOILETTAGE 1420 / CROQUETTES 12205). Cause : `revenueByCategoryProrata` dans `src/lib/metrics.ts:319-320` lisait encore `start.getFullYear()/getMonth()+1`. `start` = `startOfMonthCasa(now)` = `2026-04-30T23:00Z`, `.getMonth()` UTC = 3 (avril) → cache key `revenue:2026:4` et lecture MV pour avril. Le `computeRevenueByCategoryProrata` fallback (`metrics.ts:239-240`) avait le même pattern pour `MonthlyRevenueSummary.findFirst({ where: { year, month } })`. **Site 12 et 13 du bug TZ** non couverts par PR #96 (qui avait fixé les callers passant `start/end` mais pas la fonction qui les consomme). **Audit final via grep `.getMonth()` server-side** : ces 2 lignes sont les seules restantes ; tout le reste (calendar-helpers, AnalyticsCharts ligne 185, DashboardActivity ligne 64) opère sur des `Date` déjà-Casa ou des constructions locales sûres. **Patch** : remplacement par `casablancaYMD(start)` dans les deux fonctions (`metrics.ts:240` et `metrics.ts:320`). **Verify** : 2 nouveaux tests dans `src/lib/__tests__/metrics-tz.test.ts` — reproduction exacte du failure mode (`startOfMonthCasa(2026-05-14).getUTCMonth() === 3 (April)` mais cache key reçue par `cacheReadThrough` = `revenue:2026:5`), boundary 1er janvier (UTC 31-Dec 23:30 → Casa 1er Jan année suivante). Suite : 1246 passing. |
| Bug systémique TZ : `.getMonth()/.getFullYear()` sur runtime UTC retourne le mois précédent en Casa | RÉSOLU (2026-05-15, PR Bug TZ) | **Constat** : `/admin/health` invariant `checkJsVsMvCurrentMonth` reste rouge avec gap massif (mv=37029, js=12340 sur boarding mai). Vérifié : la MV mai contient bien 12340.01, mais l'invariant lit avril. Cascade découverte : `/admin` dashboard (KPIs `MonthlyRevenueSummary`), `/admin/analytics` (toutes queries `this/lastMonth` via date-fns `startOfMonth`), `/admin/billing` (default month + redirect), `/admin/calendar` (default `?year=&month=`), `DashboardActivity` (chart 12 mois), `DashboardCheckInOut` (todayStart UTC), `/api/availability` (validation range ±24 mois), `payment-allocation.ts` + `invoices/[id]/payments/[paymentId]` (cache key `revenue:YYYY:MM`). **Cause racine commune** : `startOfMonthCasa(now)` retourne une `Date` typée `2026-04-30T23:00:00Z` (= 00:00 Casa 1er mai). Sur runtime UTC Vercel, `.getMonth()` lit la valeur UTC = 3 (avril). Idem pour `new Date().getMonth()` direct et `date-fns startOfMonth(now)` (TZ-naive). Family-of-bugs identique à Wave 1 #2 (timezone Casa pour "demain") mergé en PR #75. **Patch** : (1) Nouveaux helpers `casablancaYMD(d)` + `currentMonthCasa()` dans `src/lib/dates-casablanca.ts` — extraction year/month/day depuis la string Casa calendar, timezone-correct sur tout runtime. (2) 11 sites server-side migrés (`health-invariants.ts`, `dashboard/page.tsx`, `analytics/page.tsx`, `billing/page.tsx` + `billing-utils.ts`, `calendar/page.tsx`, `DashboardActivity.tsx`, `DashboardCheckInOut.tsx`, `availability/route.ts`, `payment-allocation.ts`, `invoices/[id]/payments/[paymentId]/route.ts`). (3) Client components (`AvailabilityCalendar`, `BillingClient`, `RevenueSummaryManager`) NON migrés — browser TZ navigateur = Casa pour Mehdi local, risque tier 2 hors-scope. **Verify** : 7 nouveaux tests `dates-casablanca.test.ts` (boundary 23:30 UTC → next Casa month/year, parité avec `casablancaYMD(new Date())`), 1 nouveau test régression dans `health-invariants.test.ts` (MV query reçoit year=2026 month=5, pas 4). Suite complète 1244 passing. |
| Invariant `checkJsVsMvCurrentMonth` flag par asymétrie CANCELLED | RÉSOLU (2026-05-15, PR Bug A) | **Constat** : `js_vs_mv_current_month` flag chaque mois sur `/admin/guardian/invariants` — gap ~24k MAD boarding mai 2026. Cause : JS path filtre `status IN ('PAID', 'PARTIALLY_PAID', 'PENDING')` (exclut CANCELLED) ET utilise `getMonthlyInvoicesWhere` (booking-derived), tandis que la MV n'avait aucun filtre status (incluait CANCELLED full-paid). Asymétrie systémique = bruit critique permanent. **Patch** : (1) `src/lib/health-invariants.ts:278` — réécriture du JS path pour mirror la CTE de la MV exactement (`status: { not: 'CANCELLED' }` + `payments.some.paymentDate in window`, plus de `getMonthlyInvoicesWhere`). (2) Migration `prisma/migrations/20260516_revenue_mv_skip_cancelled/migration.sql` — DROP + recreate la MV avec `AND i."status" != 'CANCELLED'` dans la CTE `invoice_paid_status`. **Impact dashboards** : `monthly_revenue_mv` ne compte plus les CANCELLED full-paid → KPIs `/admin/billing` + `/admin/analytics` baissent du montant cumulé des annulations payées (correct — revenu nullifié ne doit pas être affiché). **Post-deploy** : exécuter `POST /api/admin/refresh-revenue-mv` (SUPERADMIN) pour propager la nouvelle MV immédiatement. **Verify** : 2 nouveaux tests dans `health-invariants.test.ts` — JS filter contient bien `status: not CANCELLED` + `payments.some`, plus de `OR`/`booking`. CANCELLED full-paid ignoré des 2 côtés. |
| Invariant `checkItemAllocatedOverflow` flag faux les DISCOUNT items | RÉSOLU (2026-05-15, PR Bug B) | **Constat** : l'invariant `WHERE "allocatedAmount" > total + 0.01` flag systématiquement tout item `category='DISCOUNT'` (total négatif par construction, allocatedAmount=0 par design). `0 > -150 + 0.01 = -149.99` → TRUE → faux positif sur toute facture remisée. **Cause** : règle SQL sans guard pour les items déductifs. La sémantique métier "tu ne peux pas allouer plus de cash à un item que son prix" est vacante pour les items à prix négatif. **Patch** : ajout `total > 0 AND` sur les 2 queries (sample + count) de `checkItemAllocatedOverflow` (`src/lib/health-invariants.ts:188-210`). Plus robuste qu'un filtre `category != 'DISCOUNT'` car insensible aux noms d'enum futurs. **Verify** : 4 tests régression dans `health-invariants.test.ts` — DISCOUNT item ignoré, vrai overflow toujours flag, guard SQL présent sur sample ET count. |
| 3 factures avec drift allocatedAmount < paidAmount (DU-0035, 0037, 0046) | RÉSOLU (2026-05-15, SQL data fix) | **Constat** : invariant `allocated_sum_vs_paid` flag 3 factures mai 2026 (alloc 120/120/100 vs paid 360/360/1200). **Cause** : `POST /api/admin/bookings/[id]/checkout` (commit `1a2ba81`, 2026-05-07) modifiait les BOARDING items d'une facture payée sans rejouer `allocatePayments`. CHECK constraint + trigger ajoutés le 9 mai → drift figé sur ces 3 rows. Code corrigé depuis (deleteMany/createMany + trigger). Query E `SELECT WHERE paidAmount > amount + 0.01` confirme 0 autre invoice impactée (3 cas isolés). **Patch data** : UPDATE idempotent `UPDATE InvoiceItem SET allocatedAmount = LEAST(total, paidAmount), status = 'PAID' WHERE id IN (3 IDs) AND allocatedAmount < LEAST(...) - 0.01`. Exécuté en prod, gap = 0.00 sur les 3 factures. Sémantique `LEAST(total, paidAmount)` choisie pour gérer le cas DU-0046 où total=1200.01 (arrondi arithmétique) mais paidAmount=1200.00 — on alloue jusqu'au cash effectivement reçu, jamais au-delà. **Pas de fix code applicatif** — le code actuel (post-9 mai) ne reproduit plus ce drift. Bugs A et B (règles invariant) fixent les faux positifs en parallèle. |
| Source de vérité métier | LIVRÉ (2026-05-15, PR #92 — Module 3) | `docs/BUSINESS_RULES.md` — document permanent ~600 lignes, 9 sections (Sémantique A, Loyalty, Capacités, Allocation paiements, Soft-delete, Timezone, Statuts réservation, Walk-in, RGPD). Chaque section : règle métier en français clair + règle technique avec fichier:ligne + exemple prod (Rita, timezone bug, soft-delete leak, walk-in promotion, anonymisation) + pièges "ne JAMAIS faire" + tests régression Module 2 correspondants. Référence croisée vers `REVENUE_ATTRIBUTION_DECISION.md`, `CRON_RECOVERY.md`. 2 questions explicites "À CONFIRMER MEHDI" sur walk-in OPS SMS et test RGPD purge. **À mettre à jour à chaque changement de règle métier** — toute divergence entre cette doc et le code est un bug. |
| Invariant `checkItemAllocatedOverflow` flag faux les DISCOUNT items | RÉSOLU (2026-05-15, PR Bug B) | **Constat** : l'invariant `WHERE "allocatedAmount" > total + 0.01` flag systématiquement tout item `category='DISCOUNT'` (total négatif par construction, allocatedAmount=0 par design). `0 > -150 + 0.01 = -149.99` → TRUE → faux positif sur toute facture remisée. **Cause** : règle SQL sans guard pour les items déductifs. La sémantique métier "tu ne peux pas allouer plus de cash à un item que son prix" est vacante pour les items à prix négatif. **Patch** : ajout `total > 0 AND` sur les 2 queries (sample + count) de `checkItemAllocatedOverflow` (`src/lib/health-invariants.ts:188-210`). Plus robuste qu'un filtre `category != 'DISCOUNT'` car insensible aux noms d'enum futurs. **Verify** : 4 tests régression dans `health-invariants.test.ts` — DISCOUNT item ignoré, vrai overflow toujours flag, guard SQL présent sur sample ET count. |
| Helper `recordPayment` (money path unique) | LIVRÉ (2026-05-15, PR Module 4-A) | **Constat** : 2 sites créaient un `Payment` row inline (`/api/invoices/[id]/payments` et `/api/invoices` markPaid branch). Site B (walk-in invoice creation) divergeait silencieusement de Site A : pas de cache `revenue:YYYY:MM` invalidé, pas de whitelist paymentMethod, pas de SMS admin OPS, pas de cross-role gate ADMIN→CLIENT. La drift produisait du CA fantôme dans le dashboard après création walk-in. **Cause** : copier-coller initial, divergence accumulée sans test régression. **Patch** : `src/lib/payment-allocation.ts` — `recordPayment(input, options)` est l'unique chemin d'insertion Payment + allocation. Valide amount/method/date, vérifie existence + status (`INVOICE_CANCELLED`), overpayment guard (skip si `trustedAmount: true`), insère Payment, lance `allocatePayments(invoiceId)`, invalide `revenue:YYYY:MM`. Option `prefetchedInvoice` évite un SELECT redondant si l'appelant a déjà fetché l'invoice (Site A : pour cross-role + SMS context ; Site B : invoice juste créé en tx). Les 2 routes maintenant délèguent ce chemin. Site B ajoute aussi : cross-role gate (parité Site A), SMS admin OPS via `sendSmsNow`, paymentMethod whitelist via helper, cache invalidé via helper. Le `trustedAmount: true` de Site B est **durable, pas transitoire** — Site B build `payment.amount = invoice.amount` par construction donc l'overpayment guard serait redondant. **Risks** : si une 3e route veut créer un Payment, elle doit passer par `recordPayment` (ESLint rule à venir en PR 4-B pour interdire `prisma.payment.create` direct). **Verify** : 38 tests golden-master (24 Site A + 12 Site B + 2 cross-role) verrouillent le contrat avant ET après refacto ; 6 nouveaux tests sur Site B couvrent les 4 divergences fixées (paymentMethod whitelist 400, cache invalidé, SMS ADMIN dispatché, no client COMPTA SMS, cross-role 403 + SUPERADMIN bypass). |

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

## AI GUARDIAN SENTRY (depuis 2026-05-11, PR #25)

Agent autonome de triage des erreurs Sentry via Claude Haiku.

### Pipeline
```
Sentry webhook → POST /api/webhooks/sentry
  → vérification HMAC SHA-256 (header x-sentry-signature)
  → idempotence Redis NX EX 24h sur l'event id
  → sanitize PII (emails, téléphones, IPs, JWTs, cuids, UUIDs)
  → Claude Haiku 4.5 classify (JSON strict : { category, severity, action, reason })
  → action :
      - bug_code (≥3 occurrences/24h) → ouvre issue GitHub (dedupe par label fingerprint)
      - infra / data_corruption → notif SUPERADMIN
      - transient / spam → silenced
  → persiste GuardianEvent (visible dans /admin/guardian, 30 derniers events)
```

### Fichiers clés
```
src/app/api/webhooks/sentry/route.ts   — endpoint HMAC + orchestration
src/lib/guardian/classifier.ts         — appel Anthropic Haiku, schéma JSON strict
src/lib/guardian/sanitize.ts           — strip PII avant prompt
src/lib/guardian/github.ts             — création issue + dedupe label
src/app/[locale]/admin/guardian/       — UI SUPERADMIN (badges severity + classification)
```

### Variables d'env requises
- `SENTRY_WEBHOOK_SECRET` — secret partagé avec Sentry pour vérifier HMAC
- `GITHUB_TOKEN` — PAT scope `repo` pour créer des issues
- `GUARDIAN_GITHUB_REPO` — `owner/repo` cible (ex: `Archsider/dog-universe`)
- `ANTHROPIC_API_KEY` — déjà présent pour vaccinations (réutilisé)

### Fail-open systémique
- Pas de clé Anthropic → event persisté en `pending`, pas d'action
- Pas de PAT GitHub → action loggée mais pas d'issue créée
- Redis down → idempotence dégradée, possible doublon (accepté)

Voir `docs/GUARDIAN.md` pour le setup Sentry + GitHub PAT.

---

## FEATURE FLAGS (depuis 2026-05-11, PR #27)

Flags DB-backed, homemade (rejet de GrowthBook : trop lourd pour < 100 flags actifs).

### Modèle
```prisma
model FeatureFlag {
  key             String   @id           // ex: "ai-recommendations"
  enabled         Boolean  @default(true) // kill-switch global
  rolloutPercent  Int      @default(0)   // 0-100, sticky par userId
  targetRoles     String[]               // ["SUPERADMIN", "ADMIN"]
  userWhitelist   String[]               // userIds toujours ON
}
```

### API
- `isFeatureEnabled(key, ctx)` (`src/lib/feature-flags.ts`) — async, ordre :
  1. `enabled === false` → false (kill-switch)
  2. userId dans `userWhitelist` → true
  3. role pas dans `targetRoles` (si défini) → false
  4. sticky bucket `SHA-256(userId:key) % 100 < rolloutPercent`
- Cache Redis 60 s (cache négatif aussi : `{__null:true}` pour éviter le hammering DB)
- **Fail-safe** : Redis down → lecture DB ; DB down → `false`

### UI
- Hook `useFeatureFlag(key)` côté client — cache module-scope 60 s + dédupe promesse
- Page `/admin/feature-flags` (SUPERADMIN) : table + modal créer/éditer (slider rollout, checkbox rôles, textarea whitelist)
- API : `GET/POST /api/admin/feature-flags`, `PATCH/DELETE /api/admin/feature-flags/[key]`, `GET /api/feature-flags/me` (pour le hook)

### Règle d'usage
Toute nouvelle feature lourde (UI, modèle ML, redesign) → flag par défaut `enabled: false`, rollout progressif. Suppression du flag dès que la feature est stable depuis 2 semaines.

---

## UPTIME SELF-MONITORING (depuis 2026-05-11, PR #26)

Watchdog interne — **ne remplace pas** un monitor externe (Better Stack / UptimeRobot recommandé en parallèle car ne détecte pas les outages plateforme Vercel).

### Pipeline
```
/api/cron/heartbeat (*/5 * * * *)
  → ping /api/health/ping (DB SELECT 1 < 500ms + Redis round-trip)
  → INSERT Heartbeat { ok, dbLatencyMs, redisLatencyMs, error?, createdAt }
  → si 3 derniers heartbeats KO → SMS aux SUPERADMIN (dédup 1h via Redis flag)
  → purge des Heartbeat > 30 j
```

### Page publique `/status` (sans auth, sans préfixe locale)
- Bandeau de statut courant (vert/jaune/rouge)
- Uptime % sur 24h / 7j / 30j
- Graphique latence inline-SVG (24h, sans dépendance lib chart)
- Table des 10 derniers incidents

### Helpers (`src/lib/heartbeat.ts`, 13 tests)
`uptimePercent(rows, sinceMs)`, `consecutiveFailures(rows)`, `latencySeries(rows)`, `latestStatus(rows)`.

Lien footer dans `AdminSidebar` pointant vers `/status`. Voir `docs/UPTIME.md`.

---

## ROLLBACK MIGRATIONS (depuis 2026-05-11, PR #20 + #24)

Prisma `migrate` ne supporte pas le rollback. Convention maison :

### Convention `down.sql`
- À côté de chaque `migration.sql`, créer optionnellement `down.sql` qui défait l'opération en transaction.
- Migration explicitement irréversible → `-- @rollback: not-applicable` dans les 5 premières lignes du `migration.sql`. Le runner skip et la CI passe.
- Sinon, `down.sql` absent → CI échoue (force le choix explicite).

### Runner
- `scripts/db-migrate.mjs` — applique les migrations + record SHA-256 checksum dans `_app_migrations` (warn si drift). Validateur statique (`DROP TABLE` sans `IF EXISTS`, `DELETE/UPDATE` sans `WHERE`, > 100 lignes sans `-- @safety: reviewed`).
- `scripts/db-rollback.mjs` — applique `<migration>/down.sql` en transaction et supprime la row dans `_app_migrations`.

### CI
- `.github/workflows/migration-check.yml` : prisma validate + validateur statique + tests unitaires + dry-run sur `postgres:16-alpine`.
- `.github/workflows/migration-rollback-check.yml` : pour chaque migration < 90 j avec `down.sql` actionnable, `pg_dump -s` avant/après up→down, fail si drift de schéma. Bootstrap en deux passes (PR #28) : applique d'abord toutes les migrations < CUTOFF pour avoir une DB peuplée, puis teste up/down sur les récentes.

Voir `docs/MIGRATIONS.md` pour la checklist pre-push.

---

## OBSERVABILITY (depuis 2026-05-11, PR #23)

### `withSpan` (`src/lib/observability.ts`)
Helper unifié qui wrap une opération dans `Sentry.startSpan()` + structured log. À utiliser dans toute API route ou job qui a une logique métier non triviale.

### `markCronRun` (`src/lib/observability.ts`)
À appeler en début et en fin de chaque cron — persiste un span Sentry avec attributs `cron.name`, `cron.duration_ms`, `cron.status`. Sert au dashboard `/admin/health`.

### Page `/admin/health` (SUPERADMIN)
- Statut des derniers runs de cron (succès, durée, dernière exécution)
- Invariants DB (`health-invariants.ts`) : `Invoice.amount` vs `SUM(items.total)`, `paidAmount <= amount`, BookingItem orphelins, etc.
- Bouton "Reconciler maintenant" → POST `/api/admin/health/reconcile`

### Page `/status` publique
Voir section UPTIME SELF-MONITORING.

---

## HISTORIQUE

L'historique complet des sessions de travail et décisions techniques (sécurité, perf, architecture) est consigné dans [HISTORY.md](./HISTORY.md).

**Décision-clé toujours active : Soft-delete via filtres explicites `deletedAt: null`**

---

## 🚨 ÉTAT — au 2026-05-14 (session GPS + SMS + CI + Wave 1)

### ✅ Mergé sur main (PR #67 → #71, #74 ouvert, #75 ouvert)

| PR | Sujet | Statut |
|---|---|---|
| **#67** | GPS taxi : filtre 6 portes, throttle client, `recompute-distance` endpoint, ADR-0006 | ✅ mergé |
| **#68** | 3 bugs prod : driver dashboard 0 km / PDF preview cache / CloseStayDialog discount | ✅ mergé |
| **#69** | SMS dedup atomique INSERT-first, `no-restricted-imports` guard, ADR-0007 | ✅ mergé |
| **#70** | Phone normalization, dashboard `/admin/health`, integration tests réel Postgres, flake `diagnostics.test.ts` mort | ✅ mergé |
| **#71** | CI cleanup : Node 20→22, Next 15.5.18 (CVE), bundle budget réaliste, E2E timeout 15→25min | ✅ mergé |
| **#74** | SMS respectful policy : quiet hours 21h-9h, walk-in skip, toggle UI PaymentModal, ADR-0008 | 🟡 ouvert (à merger) |
| **#75** | Wave 1 bugs métier : 5 causes racines documentées + cleanup SQL proposé | 🟡 ouvert (à merger) |

### ⚠️ Actions manuelles Supabase à exécuter (par toi, dans le SQL editor)

1. **Migration `20260512_user_role_walkin_index`** :
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_isWalkIn_idx" ON "User" ("role", "isWalkIn");
   ```
   Sans cet index, full table scan sur `User` à chaque page admin.

2. **Migration `20260512_sms_log`** : vérifier :
   ```sql
   SELECT COUNT(*) FROM "SmsLog";
   SELECT indexname FROM pg_indexes WHERE tablename = 'SmsLog';
   ```
   La table doit exister + l'index `SmsLog_phone_contentHash_key`. Sans elle, la dédup SMS (PR #69) fait fail-open silencieux.

3. **Wave 1 cleanup SQL** (PR #75) — voir [`docs/wave-1-cleanup-sql.md`](./docs/wave-1-cleanup-sql.md). Ordre :
   - §1.1 → §1.3 : merge des Pets dupliqués (re-link BookingPet, soft-delete dupes)
   - §1.4 (optionnel) : index unique partiel anti-race
   - §3.2 : cascade des TaxiTrip zombies vers terminal
   - §4.2 : backfill des TaxiTrip manquants pour les boardings avec addon taxi
   - Bloc de vérification en bas : chaque query doit retourner 0 rows après cleanup

4. **PgBouncer/Transaction Pooler** : ✅ ACTIF (vérifié 2026-05-13 — voir section "Scalabilité DB" plus haut).

### Modules livrés cette session (sources de vérité)

| Module | Rôle | ADR |
|---|---|---|
| `src/lib/taxi-gps-filter.ts` | 6-gate decision pour "ce fix GPS compte ?" — utilisé live + replay | ADR-0006 |
| `src/lib/sms-dedup.ts` (étendu) | `tryReserveSmsSend` atomique via contrainte unique SmsLog | ADR-0007 |
| `src/lib/sms-policy.ts` | `decideSmsPolicy` : quiet hours + walk-in skip pour COMPTA | ADR-0008 |
| `src/lib/dates-casablanca.ts` | Date-only math anchored UTC+1 fixe (Maroc, no DST) | — |
| `finalizeTaxiTripsForBooking` (status-transitions.ts) | Cascade TaxiTrip → terminal quand Booking → COMPLETED | — |

### Garde-fous CI ajoutés

- **`.eslintrc.json` no-restricted-imports** : import direct `sendSMS` / `sendAdminSMS` interdit hors whitelist (PR #69)
- **Postgres service container** dans `ci.yml > test` : les tests d'intégration (5) s'activent automatiquement en CI (PR #70)
- **Node 22 partout** : `fs.promises.glob()` fonctionne dans les scripts CI (PR #71)

### Stack tests

- **1046 tests passing** en local (1051 incl. 5 skipped integration sans `INTEGRATION_DATABASE_URL`)
- Flake `diagnostics.test.ts` éliminé (root cause : `mockReturnValueOnce` consommé par un appel concurrent dans Promise.all)
- TypeScript clean (`npx tsc --noEmit`), ESLint clean

---

### 2026-05-14 — Session GPS / SMS / CI / Wave-1 bugs métier

**9 PR : #67 → #75 (7 mergées, 2 ouvertes).**

1. **PR #67 — GPS taxi classe mondiale.** Un trajet ~5 km loggait 64,4 km. Trois causes racines (option `distanceFilter: 5` = React Native, ignorée par le web ; drift GPS 8-15 m à l'arrêt ; seuil serveur trop bas à 10 m). Module unique `src/lib/taxi-gps-filter.ts` avec `shouldCountFix()` (6 portes : low_accuracy / speed_outlier / time_too_close / delta_too_large / delta_too_small / speed_too_low). Throttle client 3 s. Endpoint `POST /api/admin/taxi-trips/[id]/recompute-distance` pour réparer les trips historiques. ADR-0006 + 17 tests dont reproduction exacte du bug d'origine.

2. **PR #68 — 3 bugs prod.**
   - Driver dashboard à 0 km : pivot sur `Booking.serviceType='PET_TAXI'` ratait tous les boardings avec addon. Réécrit pour pivoter directement sur `TaxiTrip`.
   - PDF preview figé à 1650 MAD : Chrome cachait le `?view=1`. Ajout `Cache-Control: no-store`.
   - CloseStayDialog 1650 au lieu 1500 : recalculait sans tenir compte de la remise. Priorité `invoiceAmount > totalPrice`, helper `selectCloseStayTotal` extrait + 7 tests.

3. **PR #69 — SMS atomique INSERT-first.** 13 appels directs à `sendSMS`/`sendAdminSMS` contournaient la dédup `SmsLog`. Race condition `read → send → write` permettait des doublons. `tryReserveSmsSend()` utilise la contrainte unique Postgres comme verrou — atomique par construction. Garde ESLint `no-restricted-imports` empêche réintroduction. ADR-0007. 26 tests.

4. **PR #70 — Hardening + observabilité.**
   - Normalisation téléphone dans la dédup (`0669…` ≡ `+212669…` ≡ `00212669…`).
   - Dashboard `/admin/health` : 4 KPI SMS (envoyés, en attente, **doublons bloqués aujourd'hui**, dernier envoi) + table d'activité récente 20 derniers (numéro masqué).
   - Tests d'intégration contre vrai Postgres (5 tests skippés sans `INTEGRATION_DATABASE_URL`, activés en CI via service container).
   - Flake `diagnostics.test.ts` éliminé (`mockReturnValueOnce` consommé par un appel concurrent dans Promise.all → 50/50 flaky).

5. **PR #71 — CI cleanup.** 5 checks rouges en permanence depuis des semaines.
   - `route.ts exports` + `bundle-budget` : crash dans `scripts/*.mjs` car `fs.promises.glob()` exige Node 22+. Bump Node 20 → 22 sur tous les workflows.
   - Bundle budget : seuil à 280 KB calé Next 14 + React 18. Vraie baseline Next 15.5 = 510 KB. Bump à 560 KB honnête.
   - Security Audit : Next 15.5.15 a une faille high-severity (DoS Server Components + 9 CVE). Bump 15.5.18 (tag `backport`).
   - E2E timeout : cancelled à 15 min systématiquement. Bumpé à 25 min.
   - `dog-universe-2btg` (projet Vercel orphelin sans DATABASE_URL) : documenté pour suppression manuelle.

6. **PR #74 (ouverte) — Respectful SMS policy.** Le solo founder fait la compta la nuit → cliente recevait 6 SMS à 20h15 plusieurs heures après les actions. Trois règles dans `src/lib/sms-policy.ts` :
   - ADMIN ou OPS → send-now toujours
   - Walk-in + COMPTA → skip total
   - Standard + COMPTA + 21h-9h Casa → defer via BullMQ delayed job jusqu'à 9h
   - Toggle UI sur PaymentModal avec label dynamique (walk-in / heures calmes). ADR-0008. 41 tests.

7. **PR #75 (ouverte) — Wave 1 bugs métier.** 5 bugs prod, causes racines investiguées avant patcher :
   - **#1 Athena ×5** : `prisma.pet.create()` sans dédup. Read-before-create idempotent + meilleure surface d'erreur dans le bouton Delete.
   - **#2 "Départ demain"** : `Math.round((endMs - nowMs) / 86_400_000)` mesure des instants UTC, pas des jours calendaires Casa. Nouveau module `src/lib/dates-casablanca.ts` (UTC+1 fixe).
   - **#3 TaxiTrip zombie** : `Booking → COMPLETED` ne cascade pas. Nouveau helper `finalizeTaxiTripsForBooking` dans `status-transitions.ts` + filtre défensif sur `/admin/driver` (exclure trips dont booking est CANCELLED/REJECTED/NO_SHOW/COMPLETED).
   - **#4 Marie Lagarde manquante** : `createBookingTx` (client + admin) écrivait BoardingDetail avec addons mais ne créait jamais les TaxiTrip. Ajout transactionnel.
   - **#5 CA / À venir faux** : downstream de #3 + #4. Filtres défensifs sur 3 queries de driver mode.
   - 24 nouveaux tests. Cleanup SQL idempotent dans `docs/wave-1-cleanup-sql.md` (à exécuter manuellement par l'opérateur).

**Décisions clés livrées :**
- **Casablanca tz fixée UTC+1** dans tout calcul "aujourd'hui / demain" (date-only). Plus jamais `Math.round((endMs - nowMs) / 86400)`.
- **SMS dedup → contrainte unique DB**, pas convention de code. Race condition mathématiquement impossible.
- **Cascade TaxiTrip → terminal** sur Booking COMPLETED. Plus de zombies sur le dashboard chauffeur.
- **Invariant "addon taxi enabled ⇒ TaxiTrip existe"** dans la même transaction que BoardingDetail.

**Stats session** : 9 PR, 7 mergées, +123 tests (1046 total), 3 ADR (0006/0007/0008), 1 doc cleanup SQL (`wave-1-cleanup-sql.md`).

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
