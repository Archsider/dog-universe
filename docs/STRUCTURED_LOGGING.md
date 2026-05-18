# Structured Logging — Setup et Runbook

## TL;DR

L'application émet déjà des logs JSON structurés sur stdout via
`src/lib/logger.ts`. **Le seul gap est l'absence d'une destination
searchable** : Vercel ne retient les logs Hobby qu'1h, Pro 3 jours.

Pour passer en mode classe mondiale (logs requêtables, alertes,
rétention 30j+), configurer un **Vercel Log Drain** vers Axiom ou
Better Stack. Setup ~5 min, zéro changement de code.

## Format

Chaque ligne stdout est un JSON :

```json
{
  "level": "warn",
  "service": "walkin-invoice",
  "message": "invoice creation failed",
  "timestamp": "2026-05-18T13:42:11.123Z",
  "requestId": "a3f9...",
  "invoiceId": "inv_abc",
  "err": { "name": "Error", "message": "...", "stack": "..." }
}
```

Champs garantis : `level`, `service`, `message`, `timestamp`. Optionnels :
`requestId` (si la requête passe par `applyI18nAndCsp`), `err`
(sérialisé via `serializeError`), n'importe quel champ custom dans
`extra`.

**PII** : tout `extra` est automatiquement passé au `scrubSensitive()` de
`src/lib/log-scrubber.ts` avant émission. N'ajoute pas de champ contenant
email/phone/token brut — ils seraient masqués mais le log polluerait
quand même la recherche.

## Utilisation dans le code

### Sync (Edge / Client / hot path)

```ts
import { logger } from '@/lib/logger';

logger.info('billing', 'payment recorded', { invoiceId, amount });
logger.warn('cron', 'redis unavailable, fail-open');
logger.error('worker', 'sms send failed', { err });
```

### Async (Server Component / Route Handler — auto requestId)

```ts
import { log } from '@/lib/logger';

await log('error', 'walkin-invoice', 'idempotency replay', { key, invoiceId });
```

La version `async` lit `x-request-id` depuis les headers (injecté par
`applyI18nAndCsp` dans le middleware) pour permettre la corrélation
de toute la chaîne d'une requête.

### Anti-pattern

```ts
// ❌ Bypass complet du logger
console.error(JSON.stringify({ ... }));

// ❌ Ajout de PII brute dans extra
logger.info('auth', 'login', { email, password });
//                              ^^^^^  ^^^^^^^ scrub mais reste un signal
```

## Setup Vercel Log Drain (5 min)

### Option A — Axiom (recommandé)

1. Créer un compte gratuit sur https://axiom.co (free tier : 500 GB/mois,
   30 jours rétention)
2. Créer un dataset `dog-universe-prod`
3. Aller sur https://vercel.com/archsiders-projects/dog-universe/settings/log-drains
4. **Add Log Drain** :
   - Source : `Standard` (application logs)
   - Destination : sélectionner l'intégration Axiom (Vercel a une intégration native)
   - Dataset : `dog-universe-prod`
   - Filter (optionnel) : `level: info` ou plus haut pour ignorer le debug
5. Save

Axiom parse automatiquement le JSON. Tu peux requêter :

```
['dog-universe-prod']
| where level == "error" and service == "walkin-invoice"
| where _time > ago(7d)
| project _time, message, requestId, invoiceId, err
```

### Option B — Better Stack (alternative)

1. Créer un compte sur https://betterstack.com (free tier : 3 GB/jour,
   7 jours rétention)
2. Créer une source de type **Vercel**
3. Coller le token fourni dans Vercel Log Drains → custom HTTP
4. Pareil pour la query (interface différente mais même principe)

### Option C — Datadog / New Relic / Logtail

Vercel a des intégrations natives pour les 4 (Axiom, Better Stack,
Datadog, Logtail). Procédure identique : sélectionner l'intégration
dans Vercel, choisir le dataset, save.

## Alertes recommandées

Une fois le log drain configuré, créer ces alertes dans Axiom (ou équiv) :

| Alerte | Query | Sévérité |
|---|---|---|
| Burst d'erreurs | `level: error` `count > 50 / 5min` | P1 |
| Money path failure | `service: "billing" OR service: "walkin-invoice"` `level: error` `count > 5 / 5min` | P0 |
| Worker DLQ rising | `service: "worker"` `message contains "dlq"` | P1 |
| Cron skipped | `service: "cron"` `message contains "lock not acquired"` `count > 3 / 1h` | P2 (probable race, à investiguer) |
| Idempotency replay flood | `message contains "replay"` `count > 20 / 5min` | P2 |

Les alertes envoient soit sur Slack soit sur l'email du SUPERADMIN
(à configurer dans la destination).

## Corrélation request-wide

Chaque requête HTTP traversant `applyI18nAndCsp` se voit attribuer un
`x-request-id` (UUID v4) :
- Injecté en header **request** → lisible par tous les Server Components
  et Route Handlers downstream via `headers().get('x-request-id')`
- Injecté en header **response** → visible côté client (Network tab)
- Auto-attaché à tout `await log(...)` async

Pour debug un bug rapporté par un client :
1. Lui demander le `x-request-id` du response (visible dans devtools Network)
2. `requestId: "a3f9..."` dans Axiom → 100% des logs de cette requête

## Worker BullMQ et crons

Les contextes hors-HTTP (BullMQ workers, crons Vercel) n'ont pas de
request context donc pas de `requestId`. Utiliser la version sync
`logger.*` et passer un `jobId` ou `cronName` en `extra` pour
permettre la corrélation manuelle.

```ts
// Worker
logger.info('worker', 'job picked', { queue: 'email', jobId });

// Cron
logger.info('cron', 'heartbeat tick', { cronName: 'heartbeat' });
```

## Migration depuis `console.*`

Si tu introduis un nouveau site qui logge :

```diff
- console.error(JSON.stringify({ level: 'error', ... }));
+ logger.error('my-service', 'descriptive message', { extra });
```

ESLint pourrait être étendu pour interdire `console.error(JSON.stringify(`
mais aucune occurrence n'existe actuellement dans le codebase
(migration finie le 2026-05-18). Tout nouveau code doit passer par
`logger` ou `log()`.

## Coût

- **Axiom free tier** : 500 GB/mois, 30j rétention — large pour Dog Universe
  (estimation actuelle ~50 MB/jour = 1.5 GB/mois, soit < 0.3% du quota)
- **Better Stack free tier** : 3 GB/jour, 7j rétention — suffisant si
  on garde le niveau `info` minimum, serré si on log beaucoup
- **Vercel Pro** : log drains inclus dans le plan ($20/mois) — pas de
  surcoût pour ajouter une destination

## Décisions

- **Pourquoi pas pino + transport HTTP direct ?** L'application est
  serverless (Vercel) — chaque invocation est éphémère. Un transport
  HTTP synchrone ajouterait de la latence sur le response, un transport
  async serait perdu à la fin de l'invocation. Le log drain Vercel
  capture stdout au niveau infrastructure, zéro overhead applicatif.
- **Pourquoi JSON sur stdout et pas un fichier ?** Vercel n'a pas de
  filesystem persistant. stdout est la seule sortie portable.
- **Pourquoi pas Sentry pour tous les logs ?** Sentry est cher au volume
  (~$26 pour 50k events/mois) et orienté exceptions. Pour les logs
  applicatifs (info/warn), Axiom/Better Stack sont 10x moins chers et
  taillés pour le volume.

Sentry reste utilisé pour : exceptions non-catchées, traces Sentry
(spans `withSpan()` dans `src/lib/observability.ts`), erreurs RSC,
breadcrumbs UI. Le log drain est complémentaire pour les logs
applicatifs structurés.
