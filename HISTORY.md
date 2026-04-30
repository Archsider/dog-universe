# HISTORY.md

> Historique des sessions de travail et décisions techniques pour Dog Universe.
> Pour la documentation vivante (architecture, conventions, risques actifs), voir [CLAUDE.md](./CLAUDE.md).

---

## HISTORIQUE ET DÉCISIONS CLÉS

### Soft-delete — filtres explicites deletedAt (depuis 2026-04-28)

L'extension Prisma `$extends` de soft-delete globale a été **revertée** (commit `3477025`) car elle est incompatible avec Vercel Edge Runtime.

**Cause** : `middleware.ts → auth.ts → prisma.ts` — cette chaîne s'exécute dans l'Edge Runtime de Vercel qui ne supporte pas les API Node.js utilisées par `$extends()`. Résultat en prod : `MIDDLEWARE_INVOCATION_FAILED` sur toutes les pages.

**Solution** : 57 filtres `{ deletedAt: null }` explicites dans les `findMany` / `findFirst` sur les modèles `User`, `Pet`, `Booking`. Ces filtres sont **intentionnels et obligatoires** — ne jamais les supprimer.

**Helper** : `notDeleted()` dans `src/lib/prisma-soft.ts` pour les nouveaux appels.

---

### 2026-04-30 — Session perf + observabilité + soft-delete revert

**~25 commits sur `main` + branche `claude/work-in-progress-8MYIG` :**

1. **`a0739f1` fix(dashboard)** — Double-comptage de `MonthlyRevenueSummary` dans le chart admin retiré.

2. **`e11b2cf` → `3477025` saga soft-delete `$extends`** — Tentative d'extension Prisma globale pour soft-delete (`e11b2cf`), corrections TS/ESLint (`303557e`), guard runtime Node.js (`e120b69`), puis **revert complet** (`3477025`) : `$extends` incompatible avec Vercel Edge Runtime (`middleware.ts → auth.ts → prisma.ts`) → `MIDDLEWARE_INVOCATION_FAILED` en prod. Solution conservée : 57 filtres `{ deletedAt: null }` explicites + helper `notDeleted()` dans `src/lib/prisma-soft.ts`.

3. **`f623bca` test(lib)** — Tests unitaires Vitest sur `cache`, `idempotency`, `capacity`, `loyalty`, `prisma-soft` (119 tests au total).

4. **`974dd1f` feat(health)** — `GET /api/health` : checks DB (Prisma `$queryRaw SELECT 1`), Redis (Upstash REST `PING`), Storage (Supabase bucket list). Retourne `{ status, checks: { db, redis, storage } }` — 200 si tout OK, 503 sinon.

5. **`d77aa18` `34ec46a` perf(sentry)** — `Sentry.startSpan()` instrumentation sur hot paths : `POST /api/bookings`, `PATCH /api/admin/bookings/[id]`, `checkBoardingCapacity`, création notifications admin. Closes le risque "Sentry instrumentation API" précédemment ouvert.

6. **`5727848` refactor(logs)** — Logs JSON structurés dans `lib/` et `api/` (`{ level, msg, ...ctx }`) — facilite parsing Sentry/Vercel logs.

7. **`1d60202` docs(soft-delete)** — Helper `prisma-soft.ts` documenté + commentaires sur les filtres `deletedAt: null` critiques + tests d'intégration.

8. **`251282f` fix(schema)** — Champ `anonymizedAt` dupliqué dans le schema Prisma après merge — supprimé.

9. **Phase perf React/Prisma (`1662cc8` → `3c67f3e`) :**
   - `9418525` deps : retrait `react-hook-form`, `@hookform/resolvers`, `date-fns-tz` (inutilisés).
   - `e38630e` deps : ajout `@vercel/speed-insights`.
   - `1662cc8` `a42c263` `2f102af` : migration `<img>` → `next/image` (client pets, dashboard, NotificationBell), extraction tableaux/styles inline, `useCallback` dans `NotificationBell`.
   - `e2a209d` perf(prisma) : N+1 fix sur crons (rappels J-1, contrats), pagination explicite, selects ciblés, batch `taxiTrip` fetches.
   - `4da4d93` perf : `Promise.all` sur updates invoices, includes shallow, server-side data fetch pour pages admin.
   - `3c67f3e` security : ajout caps `take()` sur les `findMany` non bornés restants (DoS DB).

10. **`81482a6` `74f5554` `bff8d6a` chore(skills)** — Installation `vercel-labs/agent-skills` (7 skills) + `frontend-design` + `skills-lock.json`.

11. **`3cef9b4` chore** — `.gitignore` : exclure `.claude/` (worktrees agents).

**Décisions techniques :**
- **Soft-delete `$extends` abandonné définitivement** : marqué dans CLAUDE.md comme intentionnel, ne pas retenter sans découpler `middleware → prisma`.
- **Edge Runtime constraint** : tout code chargé via `middleware.ts` doit être Edge-compatible (pas de `node:` API, pas de `$extends`, pas de `bullmq`/`ioredis`).
- **`take()` partout** : politique DoS — aucun `findMany` ne doit être unbounded en production.
- **Sentry spans** : préférés aux logs ad-hoc pour la latence DB/queue (visualisation tracing native).

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
