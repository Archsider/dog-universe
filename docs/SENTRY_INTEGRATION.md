# Sentry — Intégration & checklist

## Projet actif

- **Organisation** : `dog-universe-q4` (Sentry hosted EU region)
- **Projet** : `dog-universe` (project ID `4511209470689360`, org ID `4511208546828288`)
- **DSN canonique** :
  ```
  https://5afa584dbdac521c8ba12d42a6e3394e@o4511208546828288.ingest.de.sentry.io/4511209470689360
  ```

Cette valeur est le **fallback hardcodé** dans `src/lib/sentry-dsn.ts`. Si
`NEXT_PUBLIC_SENTRY_DSN` ou `SENTRY_DSN` ne sont pas set côté Vercel, le
code retombe sur cette valeur automatiquement.

## Variable d'env Vercel — règle d'or

`NEXT_PUBLIC_SENTRY_DSN` sur Vercel **doit pointer EXACTEMENT** sur la DSN
canonique ci-dessus, ou bien être **absente** (et alors le hardcoded
fallback prend le relais).

**Anti-pattern à éviter** : une intégration Vercel-Sentry qui auto-set
`NEXT_PUBLIC_SENTRY_DSN` à une autre valeur (typiquement liée à un projet
parasité créé via "Add Integration"). C'est exactement le bug #6 qu'on a
chassé pendant des heures le 15 mai 2026 — l'intégration `sentry-celeste-
bucket` (uninstalled depuis) écrasait silencieusement notre DSN avec celle
d'un projet qui n'existait plus.

## Comment retirer une intégration Vercel-Sentry parasite

Si tu vois `NEXT_PUBLIC_SENTRY_DSN` apparaître automatiquement avec une
valeur que tu n'as pas configurée manuellement :

1. **Vercel dashboard** → Settings → Integrations
2. Repère l'intégration Sentry (peut s'appeler `sentry-celeste-bucket`,
   `vercel-sentry-bot`, ou similaire — pas forcément `sentry` tout court)
3. Clic sur l'intégration → **Manage** → **Uninstall**
4. Confirme — ça retire les env vars auto-générées
5. **Re-ajoute manuellement** `NEXT_PUBLIC_SENTRY_DSN` avec la DSN
   canonique ci-dessus (Settings → Environment Variables → Add New →
   environnement Production)
6. Trigger un redeploy (empty commit OU bouton Redeploy dans la dashboard)

## Comment vérifier que le DSN env var pointe sur le bon projet

### Côté Vercel (interactif)

```bash
vercel env ls production | grep SENTRY_DSN
```

La valeur affichée doit matcher exactement la DSN canonique. Sinon :

```bash
vercel env rm NEXT_PUBLIC_SENTRY_DSN production --yes
echo "https://5afa584dbdac521c8ba12d42a6e3394e@o4511208546828288.ingest.de.sentry.io/4511209470689360" | vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

### Côté logs runtime (sans accès Vercel)

Cherche dans Vercel logs après un cold start :

```
[sentry-server] init
```

Cette ligne (émise par `sentry.server.config.ts`) contient :
- `dsnSource` : `NEXT_PUBLIC_SENTRY_DSN` | `SENTRY_DSN` | `hardcoded-fallback`
- `dsnHostname` : doit être `o4511208546828288.ingest.de.sentry.io`

Si `dsnHostname` est différent → env var pointe sur un mauvais projet.
Si `dsnSource === 'hardcoded-fallback'` → env var absente, le code utilise
la valeur hardcodée (= bon projet par construction).

## Comment tester l'observabilité serveur (canary endpoint)

### Tirer le canary

Depuis la console navigateur sur app.doguniverse.ma, connecté en
SUPERADMIN :

```js
await fetch('/api/admin/diag/throw-test-error', {
  method: 'POST',
  credentials: 'include',
});
```

La route répond **500 Internal Server Error** (c'est attendu — elle throw).

### Vérifier l'arrivée dans Sentry

1. https://dog-universe-q4.sentry.io/issues/
2. Recherche `guardian_canary` dans la barre
3. Doit voir un nouvel issue avec un titre type `guardian_canary_2026-05-
   15T...`, tag `canary: guardian`, niveau `error`

Si l'issue **n'apparaît PAS** sous 60 secondes :

1. Vérifier Vercel logs → `[sentry-server] init` (cf. section précédente)
2. Vérifier que Sentry MCP montre le projet `dog-universe-q4` actif
   (pas désactivé / pas en quota)
3. Vérifier les Inbound Filters du projet Sentry : Settings → Inbound
   Filters → ne doit PAS contenir une règle "filter by error message" qui
   match `guardian_canary*`

### Fréquence recommandée

Ce canary doit être tiré **manuellement** après tout changement
d'infrastructure Sentry (DSN, intégration Vercel, désactivation d'un
projet, upgrade Sentry SDK). À l'usage : ~1×/mois en routine, plus à
chaque doute sur l'observabilité.

## Référence — fichiers liés

- `src/lib/sentry-dsn.ts` — source unique de résolution DSN (env → fallback)
- `sentry.server.config.ts` — init SDK Node.js + diag log au cold start
- `sentry.edge.config.ts` — init SDK Edge runtime
- `src/instrumentation-client.ts` — init SDK client (browser)
- `src/instrumentation.ts` — entry-point Next 15 (`register()` +
  `onRequestError`)
- `src/app/api/admin/diag/throw-test-error/route.ts` — endpoint canary
- `src/app/api/webhooks/sentry/route.ts` — webhook Guardian (en aval)
