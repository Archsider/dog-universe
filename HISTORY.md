# HISTORY.md

> Historique des sessions de travail et décisions techniques pour Dog Universe.
> Pour la documentation vivante (architecture, conventions, risques actifs), voir [CLAUDE.md](./CLAUDE.md).

---

## HISTORIQUE ET DÉCISIONS CLÉS

### 2026-05-11 — Sprint « 9.5 → 10/10 » : 11 PRs (#20 → #30)

Session intensive de durcissement opérationnel post-MVP. 11 PRs mergées sur `main` couvrant la chaîne migrations, l'observabilité, la résilience, le triage automatique des erreurs, les feature flags et l'uptime monitoring.

**PRs livrées :**

1. **#20 `feat(migrations)` — shadow validation + checksum + CI check + docs**
   - `scripts/db-migrate.mjs` valide statiquement chaque `migration.sql` (DROP TABLE sans IF EXISTS, DELETE/UPDATE sans WHERE, > 100 lignes sans `-- @safety: reviewed`).
   - SHA-256 enregistré dans `_app_migrations` (colonnes ajoutées par `20260512_app_migrations_checksum`), warn sur drift.
   - Flags `--dry-run` et `--validate-only`. CI `migration-check.yml` lance prisma validate + validateur + 15 tests Vitest + dry-run sur `postgres:16-alpine`.
   - 4 migrations legacy backfillées avec `-- @safety: reviewed`.

2. **#21 `feat(perf+cleanup)` — k6 load tests + drop multi-tenant scaffolding**
   - 4 scénarios k6 dans `tests/k6/` : `booking-concurrent`, `dashboard-perf`, `invoice-payment-race`, `taxi-heartbeat-stress`.
   - **Décision** : k6 reste **séparé d'E2E** (Playwright). Objectifs orthogonaux (E2E = correctness ; k6 = throughput sous charge), runtimes différents, pas de raison de polluer le pipeline PR avec un load test.
   - Suppression du modèle `Tenant` + colonnes `tenantId` (jamais utilisé). Migration `20260512_drop_tenant_scaffold` marquée `@rollback: not-applicable` (irréversible).

3. **#22 `feat(perf+ux)` — MV partout + AddonRequest + E2E setup docs**
   - `revenueByCategoryProrata` lit `monthly_revenue_mv` en priorité avec **fallback live si MV vide pour le mois courant**. Étend l'usage MV au-delà de `cashByMonth`.
   - POST `/api/admin/refresh-revenue-mv` (SUPERADMIN, on-demand) + cron `refresh-revenue-mv` daily 02h UTC (fenêtre creuse, complète le tick horaire).
   - **Modèle `AddonRequest`** (Prisma + migration `20260512_addon_request`). Remplace le scan fragile `Notification.metadata` substring (ex-bug récurrent) par une row dédiée avec rate-limit `prisma.addonRequest.count`. Notifications legacy non migrées (par spec).
   - `docs/E2E_SETUP.md` + `scripts/check-e2e-secrets.mjs` documentent le seed prod + secrets requis. CI imprime `::notice` si secrets E2E absents.

4. **#23 `feat(observability)` — sentry spans + /admin/health + reconciliation cron**
   - `src/lib/observability.ts` : `withSpan` (wrapper Sentry + structured log), `markCronRun` (span + attributs cron.name/duration_ms/status).
   - `src/lib/health-invariants.ts` : vérifie `Invoice.amount = SUM(items.total)`, `paidAmount <= amount`, BookingItem orphelins.
   - Cron `health-reconciliation` quotidien + page `/admin/health` (SUPERADMIN) + bouton "Reconciler maintenant".
   - Pages `error.tsx` enrichies avec UX clair + Sentry capture.

5. **#24 `feat(migrations)` — rollback convention + CI drift check**
   - **Décision : `down.sql` plutôt que `prisma migrate rollback`** — Prisma ne supporte tout simplement pas le rollback. La convention manuelle `down.sql` (en transaction) est la seule option fiable.
   - Migration explicitement irréversible → `-- @rollback: not-applicable` dans les 5 premières lignes.
   - `scripts/db-rollback.mjs` applique le `down.sql` et supprime la row `_app_migrations`.
   - 6 `down.sql` rétroactifs (5 reversibles + 1 not-applicable).
   - CI `migration-rollback-check.yml` : pour chaque migration < 90j avec `down.sql`, `pg_dump -s` before/after up→down, fail si drift.

6. **#25 `feat(guardian)` — AI agent for Sentry auto-triage via Claude Haiku**
   - Pipeline : Sentry webhook → HMAC SHA-256 → idempotence Redis NX 24h → sanitize PII (emails/phones/IPs/JWTs/cuids/UUIDs) → Claude Haiku 4.5 classify → action (issue GH avec dedupe label / notif SUPERADMIN / silence).
   - **Décisions** : (a) Claude Haiku choisi pour latence + coût (vs Sonnet) ; (b) **HMAC pattern Sentry** : signature dans `x-sentry-signature`, secret partagé `SENTRY_WEBHOOK_SECRET`, vérification timing-safe ; (c) sanitize **avant** envoi à Claude — règle RGPD absolue pour les API LLM ; (d) issue GH dedupliquée par label fingerprint (1 issue / fingerprint, pas de spam).
   - Fail-open partout : pas de clé Anthropic / GitHub / Redis → degrade gracefully.
   - Modèle `GuardianEvent` + migration `20260513_guardian_events`. Page `/admin/guardian` (SUPERADMIN, 30 derniers).
   - 19 tests Vitest. Docs `docs/GUARDIAN.md`.

7. **#26 `feat(uptime)` — self-monitoring + public /status page**
   - Modèle `Heartbeat` + migration `20260513_heartbeat`. Cron `heartbeat` toutes les 5 min : ping `/api/health/ping` (DB SELECT 1 < 500ms + Redis round-trip), insert row, alerte SMS SUPERADMIN si 3 KO consécutifs (dédup 1h via Redis flag), purge > 30j.
   - Page publique `/status` (sans auth, sans préfixe locale) : bandeau + uptime 24h/7j/30j + chart latence inline-SVG (zéro dépendance) + 10 derniers incidents.
   - Helpers purs `src/lib/heartbeat.ts` (13 tests).
   - **Décision** : monitor externe (Better Stack / UptimeRobot / Cronitor) **toujours recommandé en parallèle** — un watchdog interne ne peut pas détecter un outage plateforme Vercel (l'app est down → le cron ne tourne pas → pas d'alerte).

8. **#27 `feat(feature-flags)` — homemade DB-backed flags with Redis 60s cache**
   - **Décision : homemade plutôt que GrowthBook / LaunchDarkly** — < 100 flags actifs prévus, GrowthBook/LD ajoute une dépendance externe + coût + complexité injustifiés à ce stade.
   - Modèle `FeatureFlag` (key PK, enabled kill-switch, rolloutPercent 0-100, targetRoles[], userWhitelist[]). Migration `20260513_feature_flags` + seed `ai-recommendations` (off) et `new-billing-ui` (0% SUPERADMIN).
   - `isFeatureEnabled(key, ctx)` : sticky bucketing via `SHA-256(userId:key) % 100`. Cache Redis 60s, **cache négatif aussi** (`{__null:true}`) pour éviter le hammering DB sur clés inconnues.
   - Fail-safe : Redis down → DB ; DB down → `false`.
   - Hook `useFeatureFlag` (cache module-scope 60s + dédupe promesse in-flight). Page `/admin/feature-flags` SUPERADMIN.
   - 24 tests (sticky bucketing 1000 calls, kill-switch, whitelist, role filter, distribution rollout 30%, cache, DB-down).

9. **#28 `fix(ci)` — bootstrap rollback-check DB with all legacy migrations**
   - Diagnostic : `migration-rollback-check` appliquait directement les migrations récentes sur DB vide → `20260511_invoice_sequence` échoue car `Invoice` n'existe pas encore.
   - Fix two-pass : PASS 1 applique TOUTES les migrations < CUTOFF (état complet), PASS 2 boucle up→down sur les récentes avec `down.sql` actionnable.
   - Insert dans `_app_migrations` également pour cohérence avec `db-rollback.mjs`.

10. **#29 `fix(observability)` — silence noise + harden client booking detail SSR**
    - Sentry filtre 16/2 events de "TypeError: network error", "Failed to fetch", AbortError, ResizeObserver loop — **fetch annulé par navigation utilisateur, pas des bugs**. Réduit drastiquement le bruit dans le dashboard Sentry.
    - **Bug runtime "Heartbeat manquante" diagnostiqué via les logs Vercel MCP** : `client/bookings/[id]/page.tsx` ligne 600 crashait quand un pet était soft-deleté (`bp.pet === null` après filtre `deletedAt`). Fix : `filter(bp => bp.pet)` avant `.map`, `bp.pet.name?.[0] ?? '?'`, `bp.pet.name ?? '—'` partout.

11. **#30 `fix(csp)` — rate-limit + downgrade severity to silence log flood**
    - `/api/csp-report` générait ~10K events "error" / jour dans Vercel logs.
    - Cause : code utilisait `console.error` ; **Vercel classe la sévérité d'après la méthode console, pas le payload JSON**.
    - Fix : `console.warn` pour `csp-violation` et `csp-report-malformed-json`. `console.error` réservé à `csp-report-handler-failed` (vraie erreur app).
    - Rate-limit Upstash 30 req/min/IP (fail-open). Un seul onglet avec CSP cassé peut sinon flooder en boucle.

**Décisions techniques transverses :**

- **MV-first avec live fallback** : pattern adopté pour toutes les analytics monthly. La MV peut être en retard (refresh horaire ou daily), le fallback live garantit que le mois courant est toujours juste, sans sacrifier la perf des mois passés.
- **`AddonRequest` row dédiée vs `Notification.metadata` scan** : règle générale — toute donnée métier requêtée régulièrement mérite sa propre table avec ses propres index. Le scan substring sur metadata JSON était un bug récurrent et non scalable.
- **Sanitize PII *avant* l'API LLM** : règle RGPD absolue. Le pipeline Guardian sanitize emails, téléphones, IPs, JWTs, cuids, UUIDs avant tout appel à Claude. Aucune donnée client en clair ne doit transiter par une API tierce.
- **Two-pass bootstrap CI** : pour tester les migrations récentes, il faut d'abord reconstituer une DB représentative. PASS 1 = état réel, PASS 2 = test du diff. Pattern réutilisable pour tout test de migration sur DB vide.
- **Vercel logs MCP utilisé pour diagnostic runtime** : le bug "Heartbeat manquante" ligne 600 a été identifié via inspection directe des stack traces Vercel, sans devoir reproduire localement.

**Compteurs après session :**
- 594+ tests Vitest verts (vs 306 au 2026-05-02)
- 4 nouveaux modèles Prisma : `AddonRequest`, `GuardianEvent`, `Heartbeat`, `FeatureFlag`
- 1 modèle supprimé : `Tenant` (scaffolding mort)
- 6 migrations 20260512+/20260513+ appliquées
- 14 crons Vercel actifs (3 nouveaux : `heartbeat`, `health-reconciliation`, `refresh-revenue-mv`)
- 3 nouveaux docs : `docs/MIGRATIONS.md`, `docs/GUARDIAN.md`, `docs/UPTIME.md`, `docs/E2E_SETUP.md`
- 2 workflows CI ajoutés : `migration-check.yml`, `migration-rollback-check.yml`

---

### 2026-05-10 — Upsell smart espèce + âge + seed Ultra Premium/Canvit

**1 commit sur `main` (PR #11) :**

`dc099a2 feat(upsell): suggestions smart espèce+âge + seed Ultra Premium/Canvit complet`

**DB :**
- Migration `20260510_product_upsell` : ajout `targetSpecies` (`DOG`/`CAT`/`BOTH`), `targetAge` (`PUPPY`/`JUNIOR`/`ADULT`/`SENIOR`/`ALL`), `imageUrl`, `weight`, `supplier` sur `Product`. CHECK constraints sur enums + index composite `(targetSpecies, targetAge, available)`.
- Migration `20260510_seed_products_upsell` : seed idempotent ~85 produits (Ultra Premium chien/chat + Canvit chien/chat/BOTH). Stock initial = 0 (Mehdi ajuste après réception), `available = true`. `WHERE NOT EXISTS` sur `(name, supplier)` → ré-exécution safe.

**Code — source unique de vérité :**
- `src/lib/pet-profile.ts` :
  - `getAgeCategory(dob, species)` — `PUPPY` (<12 mo) / `JUNIOR` (12-23) / `ADULT` (24-83) / `SENIOR` (≥84). `dob = null` → `ADULT` par défaut.
  - `getMatchingProducts(pets)` — génère 4 conditions OR par animal (espèce×âge | espèce×ALL | BOTH×âge | BOTH×ALL), filtre `stock > 0`, tri par pertinence (`SENIOR`/`PUPPY` > `JUNIOR` > `ADULT` > `ALL`) puis prix décroissant (upsell premium en premier). Option `includeOutOfStock` pour admin.
- `prisma/seeds/products-upsell.ts` : source TS du catalogue.

**API :**
- `GET /api/client/products/suggestions?bookingId` — auth client owner, retourne `{ suggestions: [{pet, recommended (top 3), all}] }` par animal.
- `GET /api/admin/products/suggestions?bookingId[&includeOutOfStock=1]` — version admin.
- `POST /api/admin/bookings/[id]/suggest-products` — envoie une notif `ADMIN_MESSAGE` au client avec sélection produits par animal. Walk-in → skip silencieux.

**UI :**
- `src/components/shared/UpsellSuggestions.tsx` — composant unique mode `client` (ton premium "Pour le confort de [pet]") + mode `admin` (boutons "Suggérer au client" + "Ajouter directement"). Cards horizontales scrollables, image placeholder, badge stock faible.
- `/client/bookings/[id]` — section affichée si `BOARDING` actif (`CONFIRMED`/`IN_PROGRESS`).
- `/admin/reservations/[id]` — section affichée si `BOARDING` actif.
- `/admin/products` — 3 nouvelles colonnes (Fournisseur, Espèce, Âge), 3 filtres déroulants (fournisseur/espèce/catégorie), 5 nouveaux champs au modal (`targetSpecies`, `targetAge`, `supplier`, `weight`, `imageUrl`). API admin/products POST + PATCH acceptent les 5 nouveaux champs avec validation Zod enum stricte.

**Tests :** 532/532 verts. tsc 0 erreur. 19 nouveaux tests `pet-profile` (`getAgeCategory` cas-limites + `getMatchingProducts` mock prisma).

**CLAUDE.md :** section « Upsell & produits (verrouillé 2026-05-10) » documente la règle d'utilisation obligatoire de `getMatchingProducts()`.

**Décisions :**
- Seed dans une migration SQL plutôt qu'un script Node : auto-câblé au build via `db-migrate.mjs` (cutoff baseline `20260506_`), pas de step manuel.
- Stock initial 0 + `available = true` : les produits sont visibles dans `/admin/products` dès le seed pour que Mehdi voie le catalogue, mais invisibles côté recommandations client tant que le stock n'est pas ajusté (filtre `stock > 0`).
- Composant unique client/admin via prop `context` : évite la duplication de logique d'affichage cards. La seule différence est le tone et les actions admin (suggérer/ajouter direct).

---

### 2026-05-08 — Pricing pension centralisé + recovery + invariants DB

**Plusieurs commits sur `main` (PR #10) :**

- `edb585c fix(pricing): tarif pension par animal centralisé + rollback DB`
- `dd4d4f6 fix(billing): recovery v2 + invariants DB pour sécuriser à vie`
- `4e379c3 fix(billing): normalize tous les InvoiceItem.total avant les invariants`

**Pricing pension verrouillé :**
- `src/lib/pricing.ts → getPensionPrice()` (Decimal) + `src/lib/pricing-rules.ts → getPensionPriceNumber()` (number, bundle-safe). Source unique de vérité.
- Règle : `CAT (70) → long_stay≥32 (100) → multi-chiens (100) → 1 chien seul <32 (120)`. Seuil `>= 32` (cohérent avec « 32+ »).
- `admin/bookings POST` + `checkout` : une ligne `InvoiceItem` BOARDING par animal, `unitPrice` via le helper.
- Migration `20260508_fix_pension_pricing` : recale les `InvoiceItem` BOARDING legacy.

**Recovery v2 (legacy quantities cassées) :**
- Constat : la migration `fix_pension_pricing` v1 avait corrompu les factures legacy stockées en 1 ligne avec `qty=1, unitPrice=full_invoice_amount`. Symptôme : `paidAmount > amount`.
- Migration `20260508_recover_legacy_boarding_quantities` (v1) puis `20260508_recover_v2_force_nights` : reconstruction inconditionnelle de `quantity = nights` du booking, `total = unitPrice × nights`. Pass safety net pour ré-équilibrer le BOARDING item d'écart manquant si `paidAmount > amount` après recompute.
- Migration `20260508_zz_normalize_item_totals` : force `total = unitPrice × quantity` sur **tous** les items (préalable obligatoire à l'ajout des invariants).

**Invariants DB (ne plus jamais casser) :**
- Migration `20260509_billing_invariants` :
  - `CHECK Product.stock >= 0`
  - `CHECK InvoiceItem.quantity > 0`
  - `CHECK ABS(InvoiceItem.total - unitPrice × quantity) < 0.01`
  - `CHECK Invoice.paidAmount <= amount + 0.01` (sauf `CANCELLED`)
  - `CHECK Invoice.amount >= 0 AND paidAmount >= 0`
  - **Trigger** `trg_recompute_invoice_amount AFTER INSERT/UPDATE/DELETE ON InvoiceItem` → `Invoice.amount = SUM(items.total)` automatique. Plus de drift possible.

**Fix UI billing/produits :**
- `CreateStandaloneInvoiceModal` (nouvelle facture) : remplace `<select>` statique alimenté par prop `clients` non passée → `ClientSearchSelect` (autocomplete via `/api/admin/clients/search`). Plus le bug "dropdown vide".
- Dropdown produits dans la modale : ajout d'un `<datalist>` HTML alimenté par `/api/admin/products`. L'admin peut soit taper du texte libre, soit choisir un produit du catalogue → auto-fill prix + catégorie + `productId`.
- `POST /api/invoices` : ajout du décrément stock atomique pour items avec `productId` (SELECT FOR UPDATE + check `stock >= qty` + decrement en transaction). Codes erreur `OUT_OF_STOCK` / `PRODUCT_UNAVAILABLE` / `PRODUCT_NOT_FOUND` → rollback complet.

**CLAUDE.md :** section « Pricing pension (verrouillé 2026-05-08) » documente la règle d'utilisation obligatoire de `getPensionPrice()`.

**Décisions :**
- Recovery v1 → v2 → safety net : approche défensive en couches plutôt qu'un fix monolithique. Permet de relancer les passes individuellement et de tracer ce qui a été touché.
- Invariants DB en CHECK + TRIGGER plutôt qu'agent IA : déterministe, instantané, gratuit. L'agent LLM est gardé en backup pour escalade sur anomalies novelles.
- Migration nommée `20260508_zz_normalize_item_totals` (préfixe `zz`) pour s'assurer qu'elle passe **après** les recovery (ordre alphabétique du runner) mais **avant** `20260509_billing_invariants`.

---



**3 commits sur `claude/work-in-progress-8MYIG` :**

1. **`4868649` fix(billing): extract formatMonthLabel out of 'use client' module** — La page `/admin/billing` crashait avec `"Attempted to call formatMonthLabel() from the server but formatMonthLabel is on the client"`. Cause : `page.tsx` (Server Component) importait `formatMonthLabel` depuis `BillingClient.tsx` marqué `'use client'` — Next.js 15 wraps les exports en "client references" inaccessibles côté serveur. Fix : extraction de `formatMonthLabel` (+ constantes `MONTH_NAMES_FR/EN`) dans un nouveau fichier `format-month.ts` sans directive, importé par `page.tsx` ET `BillingClient.tsx`.

2. **`2afc1fa` fix(tests+billing): add findUnique to tx mock + fix monthly filter** — Deux sous-fixes :
   - **Tests CI** : 3 tests échouaient avec `tx.booking.findUnique is not a function`. L'agent anti-doublon avait ajouté une vérification `idempotencyKey` via `tx.booking.findUnique` dans `booking-client.service.ts`, mais le mock Vitest dans `bookings.test.ts` ne l'exposait pas. Fix : ajout de `findUnique: vi.fn()` au mock `prismaTx.booking` + `mockResolvedValue(null)` dans `beforeEach`.
   - **Filtre mensuel billing** : Benjamin et Anas n'apparaissaient pas en mai car leurs factures avaient `periodDate` renseigné (= `booking.startDate`) mais le filtre WHERE ne portait que sur `issuedAt`. Correction : `OR [{ periodDate: { gte, lte } }, { periodDate: null, issuedAt: { gte, lte } }]` — priorité à `periodDate` si présent, fallback sur `issuedAt`.

3. **`0206a06` fix(contracts): exclude walk-in clients from contract tracking page** — Les clients walk-in (`isWalkIn: true`) apparaissaient dans `/admin/contracts` comme "non signés". Or les walk-ins n'ont pas de portail client, donc pas de contrat attendu. Le cron `contract-reminders` avait déjà le filtre `isWalkIn: false` ; seule la page admin en manquait. Ajout de `isWalkIn: false` dans le `where` de `prisma.user.findMany`.

**Diagnostics :**
- **`[auth][error] JWTSessionError`** sur toutes les pages admin : bruit dans les logs Vercel — cookie de session expiré/corrompu côté navigateur. Pas un bug code. Solution : déconnexion + reconnexion.
- **Facture Paul CANCELLED** : aucun cascade BOOKING_CANCELLED → INVOICE_CANCELLED dans le code. La facture a été annulée manuellement par l'admin. Comportement normal.

**Décisions techniques :**
- **Pattern `format-*.ts`** : les utilitaires de formatage utilisés à la fois par des Server Components et des Client Components doivent vivre dans un fichier neutre (sans `'use client'`). Ne jamais exporter des helpers purs depuis un module `'use client'`.
- **`periodDate` vs `issuedAt`** : `periodDate` = date de début du séjour (semantically correct pour le mois de facturation). Toujours utiliser `periodDate` en priorité dans les filtres, avec fallback `issuedAt: null` pour les factures legacy.

---

### 2026-05-04 — Session GPS Pet Taxi + audit god-mode P0/P1/P2 + fixes UI

**Fixes ciblés :**
- **`38066da` fix(dashboard)** — Compteur "X animaux sans date de naissance" sur `/admin/dashboard` exclut désormais les pets dont `owner.isWalkIn === true`. Walk-in = client sans profil complet, chasser leur DOB est du bruit.
- **`968e57d` fix(totp)** — Bug critique d'activation 2FA : `TotpSetupSection.tsx` envoyait `POST /api/auth/totp/setup` **sans body** alors que la route exige `{ password }` (et `{ password, token }` pour rotation). Le `disable` envoyait `{ token }` sans `password`. Résultat : clic sur "Activer la 2FA" → API renvoyait 400 `INVALID_BODY` → l'erreur n'était rendue que dans le block `step === 'qr'` (jamais visible). Refonte complète du flow : nouveau step `'password-setup'` (password + TOTP courant si rotation), errors visibles à chaque step avec labels lisibles (`INVALID_PASSWORD` → "Mot de passe incorrect"), Enter submit, autoFocus.
- **`dcd2776` fix(loyalty)** — Sur la transition COMPLETED d'une réservation, `if (currentGrade && ...)` empêchait la création de `LoyaltyGrade` si la row n'existait pas encore → tous les nouveaux clients restaient BRONZE. Fix : `update` → `upsert`, guard `currentGrade &&` retiré.

**GPS Pet Taxi (3 agents parallèles, worktree isolation) :**

1. **`290a358` Agent 1 — GPS pickup geolocation client** : bouton "📍 Utiliser ma position" sur `/client/bookings/new`, `navigator.geolocation.getCurrentPosition()` (timeout 10s), reverse-geocode via Nominatim OpenStreetMap (gratuit, no API key, header `User-Agent: DogUniverse/1.0`). Validation Zod `bookingCreateSchema` étendue (lat -90..90, lng -180..180). Persistance `tx.taxiDetail.create` avec `pickupLat`, `pickupLng`, `pickupAddress`. Migration `20260504_taxi_gps_pickup` ajoute 6 colonnes (`pickup{Lat,Lng,Address}`, `dropoff{Lat,Lng,Address}`).

2. **`8828c24` Agent 2 — driver navigation buttons** : `TaxiNavigationButton.tsx` sur `/admin/reservations/[id]` (PET_TAXI). Boutons Google Maps (`https://maps.google.com/?daddr={lat},{lng}`) + Waze (`https://waze.com/ul?ll={lat},{lng}&navigate=yes`). Fallback si pas de coords mais adresse texte → `https://www.google.com/maps/search/?api=1&query={addr}`. Sections séparées pickup + dropoff.

3. **`c5377ab` Agent 3 — geofencing alerts** : nouveau `src/lib/geo.ts` avec `haversineDistance(lat1, lng1, lat2, lng2): meters` + 5 tests Vitest (identique=0, symétrie, 1° lat ≈ 111km, Casa-Marrakech, 100m). Sur `POST /api/taxi/[token]/heartbeat` (chauffeur), si `pickupLat/Lng != null && trip.status === 'DRIVER_EN_ROUTE'` :
   - `< 100m` → flag Redis `taxi:arrived_alert:{bookingId}` NX EX 3600 → notif `TAXI_ARRIVED`
   - `< 1000m` (else if) → flag `taxi:near_alert:{bookingId}` NX EX 3600 → notif `TAXI_NEAR_PICKUP`
   - Wrappé `try/catch` — heartbeat ne fail jamais à cause du geofencing (fail-open)
   - Helper `tryAcquireFlag(key, ttl)` ajouté dans `src/lib/cache.ts` (SET NX EX, fail-open)
   - 2 nouveaux types `Notification` : `TAXI_NEAR_PICKUP` (Car icon, gold), `TAXI_ARRIVED` (MapPin icon, vert) dans `TYPE_CONFIG` du client.

**Audit god-mode P0/P1/P2 (450ba44 + 41861d7) :**

- **P0 SECURITY** — Cancel/reject admin booking exige désormais `cancellationReason` ≥10 chars (sinon 400 `CANCELLATION_REASON_REQUIRED`). Notification errors → `console.error` structuré au lieu de `.catch(() => {})`. SMS cancellation branche sur `userLang === 'en'`. `PATCH/DELETE /api/invoices/[id]` : guard `if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') → 403` (ADMIN ne peut pas toucher aux invoices d'un SUPERADMIN). `logAction(INVOICE_UPDATED/INVOICE_DELETED)` ajouté.
- **P0 PERF** — `GET /api/admin/clients` `_count: { bookings }` filtré sur `status: 'COMPLETED', deletedAt: null` (count fidélité, pas count brut). Migration `20260503_payment_date_index` ajoute `Payment_paymentDate_idx` + `Payment_invoiceId_paymentDate_idx` (queries revenue par période).
- **P0 RELIABILITY** — `patchBoardingDetail` (extension de séjour) : `boardingDetail.upsert` + `taxiTrip.create` + `taxiStatusHistory.create` wrappés dans `prisma.$transaction(async tx => { ... })` (atomicité).
- **P1 SECURITY** — `TotpVerifyForm` valide `callbackUrl` contre `/^\/(fr|en)\//` avant `router.push` (prévient open redirect via param). Fallback `/fr/admin`.
- **P1/P2** — Bornes Settings (`capacity_dog/cat: 0..200`, `priceDogPerNight: 0..10000`), Zod validation sur création walk-in, purge mensuelle des cron-locks Redis.

**Décisions techniques :**
- **Worktree isolation pour agents parallèles** : 3 agents modifiaient `prisma/schema.prisma` (mêmes 6 fields TaxiDetail). Merge sequentiel (1→2→3), 1 conflit cosmétique résolu (ordre des fields). Pattern validé.
- **Fail-open geofencing** : Redis down → `tryAcquireFlag` retourne `true` → possible doublon de notif (acceptable). Heartbeat ne doit jamais bloquer un chauffeur en route.
- **`if/else if` 100m/1km** : volontaire — si heartbeat manque le 1km et le chauffeur arrive directement <100m, on envoie ARRIVED (plus utile). Si 1km déjà envoyé, ARRIVED tire indépendamment (2 clés Redis distinctes).
- **Nominatim vs Mapbox** : Nominatim choisi (gratuit, no API key, fair-use 1req/s OK pour une saisie ponctuelle de pickup). Mapbox/Google Geocoding évités tant que volume < 1k req/jour.

---

### 2026-05-03 — Session audit god-mode + création réservation admin + fix routing crash

**Audit complet (4 agents parallèles)** — 21 issues identifiées, toutes fixées sur `main` :

**Security (S1–S6) :**
- **S1 CRIT** — TOTP middleware bypass : `/api/admin/*` n'était pas couvert par le guard `totpPending`. Fix dans `src/middleware.ts` : un user authentifié sans 2FA validé qui appelle `/api/admin/*` reçoit maintenant 403 `TOTP_REQUIRED` (sauf `/api/auth/totp/*`).
- **S2 CRIT** — TOTP setup/disable sans re-auth : ajout password bcrypt obligatoire sur les deux routes, + token TOTP courant requis sur disable.
- **S3 HIGH** — Replay window TOTP : `lastTotpToken` + `lastTotpUsedAt` (90s) ajoutés au User. Fenêtre fermée.
- **S4 HIGH** — Rate-limit `auth` (10/15min) ajouté sur `/api/auth/totp/{validate,verify-setup,disable}`.
- **S5 HIGH** — `totpSecret` chiffré AES-256-GCM via `TOTP_ENCRYPTION_KEY` (32 bytes hex, validé Zod). Format `v1:{iv}:{tag}:{cipher}`.
- **S6 MED** — `/api/availability` clamp month à ±24 mois + bucket `availability` 60req/15min.

**Performance (P1–P5) :**
- **P1** — `GET /api/admin/clients` : `include invoices` remplacé par `prisma.invoice.groupBy` (commit `f1f2a90`).
- **P2** — `GET /api/admin/bookings` : `include` complet remplacé par `select` ciblé pour le list/Kanban (commit `2b3fc23`).
- **P3** — `/api/availability` : `take: 2000` cap sur le `findMany` (commit `9e2b1cb`).
- **P4** — `LoyaltyBenefitClaim` : indexes `(clientId, status)` + `(status, claimedAt)`. Migration `20260503_loyalty_indexes`.
- **P5** — Setting fetch dédupliqué dans availability via closure dans le loader cache.

**UX/Produit (U1–U5) :**
- **U1** — Reschedule client : `PATCH /api/bookings/[id]` accepte `requestedStartDate+requestedEndDate` (BOARDING) ou `requestedScheduledAt` (TAXI), repasse en PENDING, prepend `[RESCHEDULE_REQUEST]{json}` dans `notes`, notif admin `BOOKING_RESCHEDULE_REQUEST`. Bouton client `RescheduleBookingButton`.
- **U2** — `BOOKING_CANCELLED` notif in-app aux admins lors annulation client (en plus du SMS).
- **U3** — Capacity bypass extend : déjà câblé sur les 3 chemins (`approveExtension`, `editDates`, `extendEndDate`).
- **U4** — Pre-flight capacity warning sur le formulaire booking client (debounced GET `/api/availability`, banners jaune/rouge, `full` bloque le submit).
- **U5** — `StayPhotosSection` : `initialPhotos` prop fetched RSC + `router.refresh()` après upload.

**Reliability (R1–R5) :**
- **R1** — `sendSMS` : timeout 10s via `AbortController` + circuit breaker `opossum` singleton (errorThreshold 50%, reset 30s).
- **R2** — `sendEmail` : ne swallow plus les erreurs, throw → BullMQ retry × 4 → DLQ. + circuit breaker.
- **R3** — BullMQ worker drain race : `worker.getActiveCount()/getWaitingCount()` polling avant `worker.close()` graceful (évite cut-off mid-send → email dupliqué).
- **R4** — Anthropic SDK : `{ timeout: 15_000, maxRetries: 1 }` sur le client.
- **R5** — `dlq-watch` cron passé hebdomadaire → quotidien (`0 9 * * *`). Health endpoint `Sentry.captureMessage` quand DLQ > 10.
- **Bonus** — `Promise.allSettled` dans `birthday-notifications` cron compte les rejected → retourné dans `failures: <n>`.

**Création réservation admin (commit `f9f5552`) :**
- `POST /api/admin/bookings` (handler dans la même route que GET) : auth ADMIN/SUPERADMIN, `adminBookingCreateSchema` Zod, réutilise `createBookingTx` + `runWithSerializableRetry` du flow client avec `isAdmin: true` (force `CONFIRMED`), gère walk-in (User créé inline + pets, password bcrypt aléatoire, `isWalkIn: true`), auto-facture `DU-{year}-{NNNN}`, `revalidateTag('admin-counts')`.
- `/admin/reservations/new` (Server Component fetch clients + pets) + `NewBookingForm.tsx` ('use client') : recherche client, toggle walk-in, pets dynamiques, AvailabilityCalendar miroir, taxi time picker, prix suggéré (jours × 200 × pets, ou 150 flat) + override manuel, checkbox facture auto.
- Bouton "+ Créer une réservation" dans header `/admin/reservations`.

**Fixes post-déploiement :**
- **Build Vercel cassé** (commit `2e62205`) : agent security avait créé la migration SQL `20260503_totp_replay` mais oublié d'ajouter `lastTotpToken` + `lastTotpUsedAt` dans `prisma/schema.prisma`. Le client Prisma ne connaissait pas les champs → erreur TS au build. Fix : ajout des deux champs au schema.
- **Routing crash Next.js** (commit `8fc409d`) : `/api/taxi/[bookingId]/heartbeat` et `/api/taxi/[token]/stream` partageaient `/api/taxi/` avec deux noms de slug différents → Next.js 15 refuse, dev server crash, toutes requêtes API renvoient HTML d'erreur (`Unexpected token '<'`). Fix : renommé `[bookingId]` → `[token]` (l'auth se faisait déjà par `trackingToken`, donc URL slug = ce token, avec check strict d'égalité avec le Bearer header).

**Décisions techniques :**
- **TOTP middleware sur API plutôt que par-route** : un seul check au niveau middleware évite de toucher 50+ routes. Trade-off : middleware fait un `auth()` (coût JWT decrypt) sur chaque requête `/api/admin/*` non-TOTP.
- **Reschedule sans nouvelle colonne DB** : `Booking.notes` taggué `[RESCHEDULE_REQUEST]{json}` plutôt qu'ajouter `metadata`. Évite migration + race avec autres agents qui touchaient le schema.
- **Walk-in user = vraie row User** : `passwordHash` bcrypt(crypto.randomBytes(32)) garantit qu'aucun login n'est possible sans reset. Email placeholder `walkin-{hex}@dog-universe.local` quand omis. `isWalkIn: true` flag pour exclure des notifs/loyalty.
- **Routing dynamic slug** : Next.js 15 impose **un seul nom de slug** par niveau de hiérarchie de route. Toujours utiliser le même nom (`[token]`, `[id]`, `[slug]`) pour les sous-routes d'un même parent.

**Variables d'env requises en production :**
- `TOTP_ENCRYPTION_KEY` — 32 bytes hex, généré via `openssl rand -hex 32`.

**Migrations Supabase à exécuter :**
- `prisma/migrations/20260502_totp/migration.sql` — colonnes TOTP de base.
- `prisma/migrations/20260503_totp_replay/migration.sql` — `lastTotpToken` + `lastTotpUsedAt`.
- `prisma/migrations/20260503_loyalty_indexes/migration.sql` — indexes composites claims.
- `prisma/migrations/20260415_user_is_walkin/migration.sql` — colonne `isWalkIn` (déjà dans le repo).

**Statut tests :** 343/343 vitest verts, 0 erreur tsc.

---

### 2026-05-02 — Session sécurité P0 + quick wins + PWA + calendrier disponibilités

**Commits sur `main` (via branche `claude/work-in-progress-8MYIG`) :**

**P0 sécurité (3 fixes) :**
1. **IDOR notes admin** — `PATCH /api/admin/clients/[id]/notes` : vérification `prisma.user.findFirst({ where: { id, role: 'CLIENT', deletedAt: null } })` avant accès. Sans ce check, un admin pouvait lire/écrire les notes de n'importe quel `userId`, y compris d'autres admins.
2. **Injection SMS** — `POST /api/admin/clients/[id]/sms` : strip des control characters Unicode (` -`, `​-‏`, `‪-‮`), regex whitelist `[\p{L}\p{N}\s.,!?()\-]{1,300}`, erreur `INVALID_SMS_CONTENT` 400.
3. **Step-up auth danger route** — `POST /api/admin/danger` : bcrypt.compare du mot de passe admin + rate-limit 3 tentatives/h (clé `danger:attempts:{userId}`) + logs audit `DANGER_STEPUP_FAILED` / `DANGER_DELETE_INITIATED` / `DANGER_DELETE_COMPLETED`.

**CI fix :**
- `secrets.*` invalide dans les `if:` GitHub Actions (`Unrecognized named-value: 'secrets'`). Fix : `env: MIGRATE_DB_URL: ${{ secrets.DATABASE_URL }}` au niveau job, puis `if: env.MIGRATE_DB_URL != ''` au niveau step.

**Quick wins sécurité :**
- `CRON_SECRET` requis en prod : `env.ts` Zod schema conditionnel (`z.string().min(32)` si `NODE_ENV === 'production'`, `z.string().optional()` sinon).
- Complexité password unifiée : `strongPassword()` helper dans `validation.ts` (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/`, 8–200 chars). Appliqué sur register, passwordChange, resetPasswordConfirm, admin-create-user.
- `take: 1000` sur `billedByCategory` dans `src/lib/metrics.ts` — défense DoS/OOM Lambda (1000 factures/période jamais atteint au volume actuel).
- HSTS déjà présent (`max-age=63072000; includeSubDomains; preload`) — confirmé, pas de changement.

**PWA (commits `bcd2dd4`, `be3d7bc`) :**
- `public/manifest.json` + `public/sw.js` (cache-first static, network-first navigation, offline fallback) + `public/offline.html` + `public/icons/icon-{192,512}.png` (générés via `sharp` depuis SVG).
- `src/components/shared/PWAInstaller.tsx` : `'use client'`, enregistre `/sw.js` via `navigator.serviceWorker.register` dans `useEffect`.
- `src/app/layout.tsx` : `metadata.manifest`, `appleWebApp`, `icons.apple` + `<PWAInstaller />` dans `<body>`.

**Calendrier de disponibilités (commit `6599dea`) :**
- `GET /api/availability` : public, Redis cache 5 min, single Prisma query + comptage JS par jour, statuts available/limited/full (seuil ≤20%).
- `src/components/shared/AvailabilityCalendar.tsx` : React pur + Tailwind, navigation mois, sélection plage, tooltips, couleurs sémantiques.
- Admin : deux panneaux DOG + CAT sur `/admin/calendar`. Client : lecture seule dans Step 3 du formulaire BOARDING.

**Fix tests (commit `0ac4c46`) :**
- `birthday-notifications.test.ts` : 5 tests échouaient depuis `41c795d` (parallélisation cron). Cause : `findFirst` → `findMany` (batch dedup) + `sendSMS` → `enqueueSms` (BullMQ). Mocks corrigés, 306 tests verts.

**Autres features de la session (via agents parallèles, commits antérieurs) :**
- `withSchema` Zod wrapper (`src/lib/with-schema.ts`) — validation body + params en une ligne pour les API routes.
- Services booking (`src/lib/services/`) — extraction logique métier : `BookingError`, `booking-admin.service.ts`, `booking-client.service.ts`.
- Indexes DB composites (`20260502_indexes_composites`) : `Notification(type, createdAt)`, `Booking(status, startDate/endDate)`.
- Cron parallelization (`Promise.allSettled`) + Redis Pub/Sub pour SSE taxi.

**Décisions techniques :**
- **Agents parallèles** : 6 agents lancés en parallèle (cron perf, env CI, withSchema, booking services, taxi SSE, Kanban). Aucun conflit git grâce au `git pull --rebase` systématique avant push + ordre de phase (1+2+3 → 4+5 → 6).
- **Audit marché** : Morocco = 0 concurrence directe, Africa = green field, Europe/USA = saturé. 2FA = plus gros gap sécurité. Multi-tenancy = bloquant fundability SaaS (pas de MRR possible sans).
- **birthday-notifications batch dedup** : `findMany` en tête de cron (une seule requête pour tous les pets du jour) plutôt que `findFirst` par pet. Évite N requêtes DB en parallèle.

---

### 2026-05-01 — Session billing + diag CA Taxi

**Bugs traités :**

1. **CA Taxi = 0 MAD sur analytics (FAUX BUG)** — Diagnostic via `console.error` structuré dans `billedByCategory` (`src/lib/metrics.ts`). Logs Vercel ont confirmé que mai 2026 ne contenait qu'une seule facture (DU-2026-0027) avec 2 items BOARDING et zéro PET_TAXI. Le code était correct : l'utilisateur n'avait simplement pas enregistré la ligne pet taxi sur la facture. Logs diagnostiques retirés après confirmation (`403c193`).

2. **`/admin/billing` — "Revenu total encaissé" affichait le cumul historique** — Le fix de `b12dd80` était sur `main` mais absent de la branche de travail `claude/work-in-progress-8MYIG` (divergence antérieure au commit). Forward-port manuel : ajout `monthStart`/`monthEnd` + `statsDateFrom`/`statsDateTo` (toujours définis), `paymentStatsWhere` toujours scopé sur la période, label `· mai 2026` affiché quand pas de filtre explicite. Vérifié via `git diff main -- billing/page.tsx` → vide.

**Commits sur `main` :**
- `44255dd fix(billing): default revenue stats to current month (forward-port)`
- `403c193 chore(metrics): remove temporary diagnostic logging from billedByCategory`
- `2ec0d1e merge(claude/work-in-progress-8MYIG): billing month default + metrics cleanup`

**Décisions techniques :**
- **Diagnostic en prod via `console.error(JSON.stringify(...))`** : pattern utile quand on n'a pas accès direct à la DB Supabase. Logs Vercel structurés permettent de vérifier le contenu DB sans query manuelle. À retirer dès la cause confirmée.
- **Branch divergence** : toujours vérifier `git diff main -- <file>` avant de re-débugger un fix supposément déjà appliqué — peut être absent par divergence antérieure au commit.

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
- **Audit sécurité** : CRITICAL/HIGH majoritairement faux positifs. Seuls 3 caps `take()` manquants confirmés réels.
- **Promise.all dans transactions Prisma** : safe — le client `tx` supporte les opérations concurrentes dans une transaction interactive.

**Nouveaux fichiers :**
```
src/app/[locale]/admin/notifications/AdminNotificationsClient.tsx
src/app/[locale]/admin/profile/AdminProfileClient.tsx
```

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
