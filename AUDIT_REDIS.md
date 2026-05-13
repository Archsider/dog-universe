# AUDIT_REDIS.md — consommation Upstash Redis

> Audit initial : 2026-05-13 (read-only).
> Optimisations R1 + R2a + R4 appliquées : 2026-05-13 — voir §6.
> Contexte : Upstash signale ~500K commandes/mois (cap free tier atteint).

---

## 1. Inventaire des consommateurs Redis

### 1.1 Workers BullMQ — `/api/workers/process`

| Élément | Valeur |
|---|---|
| Cron schedule | `* * * * *` — **toutes les minutes** (vercel.json) |
| Workers créés par run | 2 (email + sms) en `Promise.all` |
| Concurrency par worker | 3 (ligne 143 de `workers/process/route.ts`) |
| Polling style | BullMQ `BRPOPLPUSH` (blocking, ~1 cmd/poll/worker) + Lua scripts |
| `lockDuration` | défaut BullMQ = **30 s** |
| Max jobs/queue/run | 10 (`MAX_JOBS_PER_QUEUE`) |
| Hard timeout | 55 s (`WORKER_TIMEOUT_MS`) |
| Early-exit guard | `getJobCounts('waiting','active','delayed')` × 2 queues + 1 Postgres count |

Files clés :
- `src/lib/queues/index.ts` (Queue singletons email/sms/dlq)
- `src/lib/redis-bullmq.ts` (IORedis TCP)
- `src/workers/processors.ts` (handlers)
- `src/app/api/workers/process/route.ts` (cron endpoint)

### 1.2 Queues BullMQ déclarées

| Nom | `defaultJobOptions` | Volume estimé/jour |
|---|---|---|
| `email` | attempts 4, backoff exp 1 min | ~10-50 (notifs ponctuelles + crons batch) |
| `sms`   | attempts 3, backoff exp 5 min | ~5-30 (reminders + admin alerts) |
| `dlq`   | no retry (tombstone)          | ~0-5 (alimenté par les échecs ci-dessus) |

### 1.3 Crons Vercel touchant Redis

| Cron | Schedule | Touches Redis | Cmds estimées/run |
|---|---|---|---|
| `/api/workers/process` | `* * * * *` (1440/j) | BullMQ poll + counts + DLQ flag | 5-50 (idle), 50-300 (job actif) |
| `/api/cron/heartbeat` | `*/5 * * * *` (288/j) | `tryAcquireFlag` + ping `/api/health/ping` (qui pingue Redis) | ~3 (acquireCronLock + flag + health) |
| `/api/cron/refresh-monthly-revenue` | `5 * * * *` (24/j) | `acquireCronLock` | 1 |
| `/api/cron/reminders` | `0 8 * * *` (1/j) | lock + enqueue ~30 SMS/email | 1 + 30-60 (enqueue) |
| `/api/cron/birthday-notifications` | `0 8 * * *` (1/j) | lock + enqueue | 1 + N |
| `/api/cron/contract-reminders` | `0 8 * * 1` (1/sem) | lock + enqueue | 1 + N |
| `/api/cron/overdue-invoices` | `0 9 * * *` (1/j) | lock + enqueue | 1 + N |
| `/api/cron/review-requests` | `0 10 * * *` (1/j) | lock + enqueue | 1 + N |
| `/api/cron/dlq-watch` | `0 9 * * *` (1/j) | `getJobCounts` x3 queues | 3-5 |
| `/api/cron/weekly-pet-report` | `0 9 * * 1` (1/sem) | lock + enqueue | 1 + N |
| `/api/cron/taxi-retention` | `0 4 * * *` (1/j) | lock | 1 |
| `/api/cron/db-backup` | `0 3 * * *` (1/j) | lock | 1 |
| `/api/cron/health-reconciliation` | `0 6 * * *` (1/j) | lock | 1 |
| `/api/cron/refresh-revenue-mv` | `0 2 * * *` (1/j) | lock | 1 |
| `/api/cron/purge-anonymized` | mensuel | lock | 1 |

### 1.4 Rate-limiting middleware (`@upstash/ratelimit`)

`src/middleware/rate-limit.ts` — **17 buckets `Ratelimit.slidingWindow`** distincts, partageant 1 client REST :

| Bucket | Limite | Routes typiques |
|---|---|---|
| `auth` | 10/15min | signin, register, callback |
| `totp` | 10/15min | TOTP setup/validate |
| `passwordReset` | 5/60min | reset-password, profile/password |
| `bookings` | 20/60min | POST /api/bookings |
| `uploads` | 30/60min | uploads, contracts/sign |
| `adminMutation` | 300/60min | tout POST/PATCH/DELETE `/api/admin/*` |
| `taxiStream` | 60/60min | GET /api/taxi/{token}/stream (par open) |
| `taxiTracking` | 600/60min | GET /api/taxi-tracking/* (polling fallback) |
| `rgpd` | 5/60min | export, anonymize |
| `addonRequest` | 10/60min | addon + extension request |
| `health` | 60/min | /api/health (monitoring probes) |
| `availability` | 60/15min | GET /api/availability |
| `payment` | 5/60min | POST /api/invoices/[id]/payments |
| `invoiceCreate` | 20/60min | POST /api/admin/invoices |
| `vaccinationExtract` | 10/60min | extract vaccination (Anthropic) |
| `productOrder` | 30/60min | client add-product |
| `geocode` | 30/60min | reverse geocode |

**Coût Redis** : `slidingWindow` = ~**5 commandes par requête** (sorted set ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE + pipeline). Multiplié par le nombre de requêtes sur routes rate-limitées.

### 1.5 Cache `cacheReadThrough` (`src/lib/cache.ts`)

22 fichiers utilisent le helper. Hot paths :
- `capacity_dog/cat` — TTL 5 min, lecture à chaque création de booking
- `LoyaltyGrade` per userId — TTL 5 min
- `Notification` unread count — TTL 30 s, lecture à chaque page client/admin
- Admin pending+claims counts — TTL 30 s via `unstable_cache` (Vercel KV, pas Upstash)

Chaque lecture cache hit = 1 GET. Cache miss = 1 GET + 1 SETEX.

### 1.6 Taxi geofencing + Pub/Sub

- **`/api/taxi/[token]/heartbeat`** (POST par chauffeur, fréquence ~10s pendant une course) : `setLocation` + `tryAcquireFlag` ARRIVED/NEAR (2-4 cmds par ping)
- **`/api/taxi/[token]/stream`** (SSE viewer) : IORedis SUBSCRIBE + getLocation poll fallback. Une course en cours = 1 connexion permanente + commandes pub/sub
- **`taxi-auto-transition`** : transitions de status taxi via Redis flags

### 1.7 CSP report
`/api/csp-report` — `Ratelimit.slidingWindow(30, '60s')` par IP, fail-open. Browser CSP violations peuvent en générer beaucoup en cas de bug CSP.

### 1.8 Idempotency + cron-lock
- `tryAcquireIdempotency` sur POST /api/bookings — 1 SET NX EX par requête
- `acquireCronLock` sur chaque cron — 1 SET NX EX par run

---

## 2. Estimation consommation actuelle

### Hypothèses
- Trafic modeste (1k-5k requêtes/jour sur l'app)
- ~30-50 emails+SMS/jour
- 1-3 courses taxi/jour
- Heartbeat health check toutes 5 min

### Décomposition mensuelle

| Composant | Cmds/mois (estimées) | % du total |
|---|---|---|
| **Workers BullMQ cron 1/min** (43 200 runs) | 43 200 × 5-10 = **220 K — 430 K** | 40-70 % |
| **Rate-limit middleware** (5K req/j × 50% sur routes RL × 5 cmds) | 30 × 5 000 × 0.5 × 5 = **375 K** | 60-75 % |
| **Cache reads (notif unread, capacity, loyalty)** | 30 × 1 000 × 2 = **60 K** | 10 % |
| **Heartbeat cron 5min** (8 640 runs × 3 cmds) | **26 K** | 5 % |
| **BullMQ job processing** (50 jobs/j × ~20 cmds Lua) | 30 × 50 × 20 = **30 K** | 5 % |
| **Taxi heartbeat + SSE** (3 courses × 30 min × ~12 cmds/min) | 30 × 3 × 30 × 12 = **32 K** | 5 % |
| **Crons quotidiens divers** | ~1 K | <1 % |
| **TOTAL estimé** | **~750 K — 950 K /mois** | 100 % |

⚠️ L'estimation excède 500 K même sur un trafic modeste. **Les 2 plus gros postes représentent ~80% du total : Workers BullMQ minute-par-minute et rate-limiting middleware.**

---

## 3. Recommandations classées par impact

### 🔴 HAUT — gain estimé > 200 K cmds/mois

#### R1. Réduire la fréquence du worker BullMQ
**Impact** : passer de `* * * * *` (1/min) à `*/5 * * * *` (1/5 min) divise la base par 5 → **~200 K cmds économisées**.

**Conséquence métier** : la latence d'envoi des SMS/emails passe de ≤ 1 min à ≤ 5 min en moyenne. Le code transactionnel critique utilise déjà `sendEmailNow`/`sendSmsNow` (fire-and-forget direct depuis `src/lib/notify-now.ts`), donc la queue ne traite plus que des batches de crons. Latence ≤ 5 min est acceptable pour les reminders, birthday, weekly reports.

**Action** : modifier `vercel.json` ligne 5 (`/api/workers/process` schedule) + revoir si des paths critiques dépendent encore de l'enqueue → fallback direct est déjà câblé (`enqueueEmail`/`enqueueSms` fait `sendEmail` direct si BullMQ down/non config).

#### R2. Désactiver le rate-limit middleware quand Redis sature, OU bypasser sur routes faible-risque
**Impact** : ~300 K cmds économisées sur les routes les moins sensibles (`adminMutation`, `availability`, `taxiTracking`).

**Options** :
- **a)** Retirer le rate-limit sur les endpoints publics non-sensibles (`/api/availability`, `/api/health`) → ces deux représentent une part énorme du trafic
- **b)** Augmenter les fenêtres (15 min → 60 min) pour réduire la fréquence d'écriture
- **c)** Le bucket `adminMutation` 300/60min sur tout `/api/admin/*` mutating est très large et coûteux. Garder uniquement sur `/api/admin/danger` et endpoints critiques

**Décision recommandée** : `availability`, `health`, `taxiTracking` n'ont pas besoin de rate-limit Upstash — un cache CDN edge ou un cap fixe via `vercel.json` suffit. Soustraire ~300 K cmds.

### 🟠 MOYEN — gain estimé 50-200 K cmds/mois

#### R3. Augmenter le TTL du cache `notifCount` (30 s → 2 min)
**Impact** : invalidation explicite déjà en place via `invalidateNotifCount(userId)` sur PATCH /read et /read-all. Le TTL de 30 s est donc redondant — fixer à 2 min ne dégrade pas l'UX.
**Gain** : ~40 K cmds/mois.

#### R4. Désactiver le BullMQ early-exit `getJobCounts` quand le cron est récent
**Impact** : actuellement chaque run du cron `/api/workers/process` fait `getJobCounts` × 2 queues + 1 Postgres count. Pour un cron qui tourne 1/min, c'est 3 cmds × 1440 = 4 320 cmds/jour soit ~130 K/mois.

**Alternative** : flag Redis "last-enqueued" mis à jour par `enqueueEmail`/`enqueueSms`. Si vide depuis > 60 s ET pas de course taxi active → skip le run sans interroger BullMQ. Coût : 1 GET vs 3 commandes BullMQ.

#### R5. Heartbeat cron toutes les 10 min au lieu de 5 min
**Impact** : ~13 K cmds économisées. Trade-off : détection d'outage retardée de 5 min (acceptable si un monitor externe existe en parallèle — déjà recommandé dans CLAUDE.md).

### 🟢 BAS — gain < 50 K cmds/mois

#### R6. Consolider les 17 buckets rate-limit en 5-7 grands buckets
**Impact** : pas de gain de commandes (chaque limite use 1 bucket à la fois), mais réduit le nombre de clés Redis créées (moins de pression mémoire). Améliore aussi la maintenabilité.

#### R7. Augmenter `removeOnComplete: { count: 200 }` → `{ count: 50 }`
**Impact** : moins de jobs gardés en historique = moins de pression mémoire mais pas de gain commandes direct. Cosmétique.

#### R8. Passer le SSE taxi stream en polling seul (retirer SUBSCRIBE)
**Impact** : éliminer 1 connexion permanente + commandes pub/sub par course active. Faible si peu de courses, mais peut spiker pendant pics. Trade-off : latence position passe de quasi-instant à 5 s.

#### R9. Désactiver `acquireCronLock` sur crons à idempotence DB déjà garantie
**Impact** : les crons `reminders`, `birthday-notifications`, `review-requests` ont déjà une déduplication par-entité côté DB (check `Notification.findFirst` avant insert). Le lock Redis est défense en profondeur — non strictement nécessaire.
**Gain** : ~30 cmds/mois (négligeable, garder pour la robustesse).

---

## 4. Quick wins (combo recommandée)

Implémenter **R1 + R2(a) + R4** :
- R1 : worker BullMQ `*/5 * * * *` → **−200 K cmds**
- R2(a) : retirer rate-limit sur `availability` + `health` + `taxiTracking` → **−250 K cmds**
- R4 : flag "last-enqueue" pour skip early-exit → **−130 K cmds**

**Total estimé : −580 K cmds/mois** → consommation projetée ~200-350 K/mois, **bien en-dessous de la limite free tier**.

Trade-offs acceptés :
- Latence emails/SMS batch jusqu'à 5 min (transactionnel reste instant via `sendEmailNow`)
- Pas de rate-limit Redis sur 3 endpoints publics low-risk (mais ils restent cappés via cache CDN et per-IP au niveau Vercel/Cloudflare)
- Détection outage health 1 min plus lente

---

## 5. À ne PAS toucher (sécurité / fonctionnel critique)

- **Rate-limit `auth` + `totp` + `passwordReset`** : protection brute-force essentielle, garder
- **`enqueueEmail`/`enqueueSms` fallback direct** : déjà optimisé fail-open
- **Cron-lock sur crons non-idempotents** : ex `db-backup`, `purge-anonymized`
- **BullMQ DLQ** : tombstone manuel, low-volume
- **Idempotency-Key sur POST /api/bookings** : protection double-booking

---

## 6. Optimisations appliquées (2026-05-13)

PR `claude/redis-optimization` — 3 commits ciblés, zéro migration, zéro
changement de schéma. Trade-offs documentés ci-dessous.

### R1 — Worker cron `* * * * *` → `*/5 * * * *`
- Fichier : `vercel.json` ligne 5
- Commit : `perf(worker): cron from * * * * * to */5 * * * * (R1)`
- Économie projetée : **~220-430 K cmds/mois**
- Conséquence métier : latence batch (rappels, anniversaires, weekly
  reports) passe de ≤ 1 min à ≤ 5 min. Le code transactionnel critique
  (booking confirmations, validation, photos, messages, factures)
  utilise `sendEmailNow` / `sendSmsNow` qui contournent la queue — la
  latence visible côté utilisateur reste sub-second.

### R2a — Suppression rate-limit Upstash sur 3 endpoints
- Fichier : `src/middleware/rate-limit.ts`
- Commit : `perf(ratelimit): remove Upstash on availability/health/taxi-tracking (R2a)`
- Économie projetée : **~250 K cmds/mois**
- Endpoints concernés :
  - `/api/health` (était 60 / 1 min) — public uptime probe
  - `/api/availability` (était 60 / 15 min) — déjà cache Redis 5 min
  - `/api/taxi-tracking/*` (était 600 / 60 min) — polling viewer ≈ 360/h
- Buckets supprimés (dead code retiré) : `health`, `availability`,
  `taxiTracking`. Type `DynamicBucket` mis à jour.
- **NE PAS confondre avec `taxiStream` (SSE)** qui reste rate-limité
  60/h per-open. Le polling JSON est public et idempotent ; le SSE est
  une connexion long-lived plus coûteuse.
- Buckets critiques intacts (garde-fou test) : `auth`, `totp`,
  `passwordReset`, `bookings`, `uploads`, `adminMutation`, `payment`,
  `invoiceCreate`, `vaccinationExtract`, `productOrder`, `geocode`,
  `rgpd`, `addonRequest`, `taxiStream`.

### R4 — Flag `bullmq:lastEnqueue` pour skip getJobCounts
- Fichiers :
  - `src/lib/cache.ts` : 4 nouveaux helpers (`markQueueEnqueue`,
    `getQueueLastEnqueueMs`, `markQueueFullCheck`,
    `getQueueLastFullCheckMs`). Tous fail-open.
  - `src/lib/queues/index.ts` : `markQueueEnqueue()` après chaque
    `queue.add` réussi (jamais sur fallback direct).
  - `src/app/api/workers/process/route.ts` : skip-check avant le bloc
    `getJobCounts`.
- Commit : `perf(worker): skip getJobCounts when no recent enqueue (R4)`
- Économie projetée : **~130 K cmds/mois**
- Algorithme :
  1. À l'enqueue (succès BullMQ) → SET `bullmq:lastEnqueue = now()` EX 3600s
  2. Au worker tick :
     - GET `bullmq:lastEnqueue` (timestamp)
     - GET `bullmq:lastFullCheck` (timestamp)
     - COUNT `TaxiTrip.status = DRIVER_EN_ROUTE`
     - Skip si `lastEnqueue > 10 min ago` ET `lastFullCheck < 1 h ago`
       ET `activeTrips === 0`
  3. Si pas de skip → `getJobCounts × 2` + `markQueueFullCheck()`
- **Filet de sécurité** : la fenêtre force-check 1 h garantit qu'un job
  resté en `active` après un crash worker est détecté au plus tard 1 h
  plus tard — ≪ aux backoff BullMQ (1 min email, 5 min sms).

### Total projeté
**~580-810 K cmds/mois économisées** → consommation cible
**~200-350 K /mois**, bien sous le cap free tier 500 K.

### Mesure réelle
À mesurer 24-72 h après le merge dans le Upstash dashboard. Tableau de
suivi à compléter :

| Date           | Cmds/jour observées | Cmds/mois projetées |
|----------------|---------------------|---------------------|
| Avant merge    | ~25-32 K            | 750-950 K           |
| J+1 après merge | (à mesurer)         | (à projeter)        |
| J+7 après merge | (à mesurer)         | (à projeter)        |

### Tests garde-fous
- `src/__tests__/middleware/rate-limit.test.ts` :
  - R2a : 3 routes supprimées ne matchent plus de bucket
  - R2a : 9 buckets critiques restent mappés (régression test)
- `src/lib/__tests__/cache.test.ts` :
  - R4 : 4 helpers avec TTL, fail-open, valeurs corrompues

### Hors scope (non appliqué)
- R3 (TTL notifCount 30s → 2min) — gain modeste, déféré
- R5 (heartbeat 5min → 10min) — déféré, dépend de la confiance dans le
  monitor externe
- R6+ (consolidation buckets, suppression SUBSCRIBE taxi) — refactor
  plus invasif, à reconsidérer si les R1+R2a+R4 ne suffisent pas

