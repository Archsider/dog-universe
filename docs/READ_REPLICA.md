# Read replica — stratégie

## Pourquoi

Les hot paths analytics (`/admin/billing`, `/admin/analytics`, KPIs dashboard)
font des `groupBy` / `aggregate` lourds sur `Invoice` + `Payment`. Sur la même
DB que les writes critiques (`POST /api/bookings`, `PATCH /admin/bookings/[id]`),
ces queries :

1. Bloquent les locks en lecture pendant plusieurs secondes
2. Saturent la connection pool sur les pics commerciaux (vendredi soir, fêtes)
3. Mettent le dashboard SUPERADMIN en compétition avec la création de booking
   client

Solution : router les lectures analytiques vers une **read replica**, garder
le primary pour les mutations + lectures critiques.

## Setup Supabase Pro

1. Aller dans Supabase Dashboard → Project → Database → **Read Replicas**
2. Activer une replica (région la plus proche de Vercel — `eu-west-3` Paris)
3. Récupérer la connection string (port 5432, hostname différent)
4. Dans Vercel → Environment Variables :
   - `DATABASE_URL` (existant — primary write)
   - `READ_DATABASE_URL` (nouveau — read-only, pooler conseillé)

## Pattern Prisma — 2 clients

Fichier : `src/lib/prisma-read.ts` (scaffolding livré 2026-05-17, PR
read-replica-scaffolding-may17).

```ts
export const prismaRead = process.env.READ_DATABASE_URL
  ? new PrismaClient({ datasources: { db: { url: process.env.READ_DATABASE_URL } } })
  : prisma; // fallback transparent vers primary
```

**Important** : `prismaRead` est opt-in par caller. Aucune route existante
n'est modifiée par défaut.

## Routes éligibles (à migrer progressivement)

| Route | Pourquoi | Priorité |
|---|---|---|
| `src/lib/metrics.ts → cashByMonth()` | groupBy 12 mois × Payment | Haute |
| `src/lib/metrics.ts → revenueByCategoryProrata()` | aggregate complexe | Haute |
| `src/lib/metrics.ts → volumeByCategory()` | groupBy InvoiceItem | Haute |
| `/admin/analytics` page | top-level reads non transactionnelles | Haute |
| `/admin/billing` listing | Invoice findMany filtrée par mois | Moyenne |
| Dashboard KPI (revenue MTD, bookings count) | aggregates simples | Moyenne |
| `/admin/clients` listing | groupBy invoices PAID par client | Basse |

## Routes à NE JAMAIS migrer

- `auth()` / sessions / token validation (consistency requise)
- Booking confirm/reject (read-modify-write)
- Invoice create / payment record (read-modify-write)
- Capacity check (`checkBoardingCapacity`) — un PENDING juste créé doit être
  visible immédiatement (lag de réplication = double-booking possible)
- Toute route dans une `$transaction` Serializable
- Idempotency check (`tryAcquireIdempotency`) — déjà sur Redis, ne touche pas DB

## Lag de réplication

Supabase doc indique typiquement < 100 ms en région proche, jusqu'à
quelques secondes sur charge. Règle d'or : **si un user vient juste d'écrire
quelque chose, ne pas le lui relire depuis la replica dans la même requête.**

Pattern correct :

```ts
// Mutation (primary)
const booking = await prisma.booking.create({ ... });

// Notif retourne l'ID que l'on a en mémoire — pas besoin de relire
return NextResponse.json({ id: booking.id });
```

Pattern à éviter :

```ts
const created = await prisma.booking.create({ ... });
// Lag possible — peut retourner null !
const reread = await prismaRead.booking.findUnique({ where: { id: created.id } });
```

## Migration progressive

1. **Phase 1** : provisionner replica Supabase + ajouter `READ_DATABASE_URL`
   sur Vercel preview uniquement. `prismaRead` reste fallback `prisma` en prod.
2. **Phase 2** : activer la var d'env en prod sur staging branch. Monitorer
   1 semaine (Sentry errors, tail latency).
3. **Phase 3** : migrer une route à la fois (commencer par
   `metrics.cashByMonth`). PR + load test k6 (`e2e/load/billing-readonly.js`)
   avant merge.
4. **Phase 4** : généraliser sur toutes les routes éligibles ci-dessus.

## Coût

Supabase Pro : ~$25/mois pour 1 replica. Justifié dès qu'on dépasse ~50 admins
simultanés sur le dashboard ou ~5k bookings/mois.

## Monitoring

Ajouter dans Sentry tags :
- `db.role: "primary" | "replica"` sur les spans des transactions
- Comparer p95 latency primary vs replica par route

Si replica > primary, c'est un signe que la replica est sous-provisionnée
(plan upgrade) ou que le lag grossit (vérifier `pg_stat_replication`).

## Tests avant prod

Avant de pousser un consommateur de `prismaRead` en prod :

1. **Staging end-to-end** : déployer la PR avec `READ_DATABASE_URL` set
   sur la branche preview Vercel. Smoke-test la route (charge + cohérence).
2. **Load test k6** : pour les hot paths analytics, exécuter le scénario
   `tests/k6/dashboard-perf.js` contre staging avant + après. Vérifier
   que p95 baisse et que primary CPU descend.
3. **Replay 24h** : laisser tourner staging 24h avec trafic de canari.
   Watcher Sentry pour `Prisma.ClientInitializationError` (DNS replica
   down, credentials, etc.) et `PrismaClientKnownRequestError` (rare,
   mais possible si schema drift entre primary/replica).

## Rollback (instant)

Si la replica part en vrille (lag massif, indisponible, drift schema) :

1. **Vercel** → Project Settings → Environment Variables → supprimer
   `READ_DATABASE_URL` sur Production.
2. Redéployer (ou attendre le prochain push — le fallback est
   transparent : `prismaRead` redevient pointeur sur `prisma`).
3. Aucune migration de code n'est requise. Aucune mutation n'est
   affectée puisque les writes ne sont jamais routés vers la replica.

## Garde-fous

- **Singleton dev** : `prismaRead` est mis en cache sur `globalThis` en
  dev pour éviter d'épuiser les connexions au reload Next.js (même
  pattern que `prisma`).
- **Pas de `$transaction` cross-client** : Prisma ne supporte pas une
  transaction qui spanne 2 clients. Si une route a besoin de read +
  write atomique, tout passe par `prisma`.
- **Tests** : `src/lib/__tests__/prisma-read.test.ts` verrouille le
  contrat de fallback (référence identique au write client si env
  absent, instance distincte si env présent).
