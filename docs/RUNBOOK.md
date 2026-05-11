# RUNBOOK — Procédures d'incident

Procédures opérationnelles à exécuter en cas d'incident. Toujours commencer par
vérifier `/status` (page publique) + `/admin/health` (SUPERADMIN) avant de
plonger.

## Diagnostic général (30 sec)

1. **Page publique** : <https://dog-universe.com/status> — uptime 24h, latence DB/Redis, derniers KO
2. **Admin** : `/admin/health` — invariants DB + dernier run de chaque cron
3. **Sentry** : dashboard prod — burst d'erreurs sur la dernière heure
4. **Vercel** : Functions → Logs → filtre `level=error`
5. **Supabase** : Database → Logs → Postgres logs sur les 15 dernières min

---

## 1. Login KO

**Symptômes :** users ne peuvent pas se connecter, "Identifiants incorrects" malgré bon password, redirections en boucle vers `/signin`.

### Diagnostic
```bash
# Vercel logs — chercher les 401 sur /api/auth/*
# Sentry — filtre transaction:/api/auth/callback/credentials
```

### Causes fréquentes
| Cause | Indice | Fix |
|---|---|---|
| `NEXTAUTH_SECRET` rotaté sans rebuild | Tous les users 401 d'un coup | Re-déploiement Vercel pour propager la var |
| `tokenVersion` incrémenté en masse | 401 sur sessions existantes uniquement | Normal après reset password — l'user doit se reconnecter |
| DB down (Supabase) | `/status` rouge sur DB | Voir section "DB lente / down" |
| Rate-limit `auth` bucket (10/15min) | 429 dans les logs | Identifier l'IP, lever le ban manuellement via Upstash CLI |
| 2FA TOTP forcé sans secret config | `TOTP_REQUIRED` 403 sur les ADMIN | Vérifier `TOTP_ENCRYPTION_KEY` en env Vercel |

### Action immédiate
1. Vérifier `NEXTAUTH_SECRET`, `DATABASE_URL`, `TOTP_ENCRYPTION_KEY` dans Vercel
2. Si un user spécifique : forcer `tokenVersion` reset → `UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1 WHERE email = '…'`
3. Si tous les users : c'est probablement la DB ou Redis — passer aux sections dédiées

### Rollback
Si déploiement récent : Vercel → Deployments → **Promote to Production** sur le précédent deploy.

---

## 2. DB lente / down

**Symptômes :** timeouts 504, page `/status` rouge sur DB, `dbLatencyMs > 1000` dans `Heartbeat`.

### Diagnostic
```sql
-- Sessions actives + requêtes longues
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state != 'idle' AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Locks bloquants
SELECT blocked_locks.pid AS blocked_pid, blocking_locks.pid AS blocking_pid, blocked_activity.query AS blocked_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.granted AND NOT blocked_locks.granted
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid;
```

### Causes fréquentes
| Cause | Indice | Fix |
|---|---|---|
| Pool connections épuisé | `Too many connections` dans Sentry | Augmenter le pool Supabase ou réduire `connection_limit` Prisma |
| Long-running `$transaction` (Serializable) | Locks bloquants | `SELECT pg_cancel_backend(<pid>)` sur le bloquant |
| Migration en cours | `_prisma_migrations` row récente | Attendre la fin, ne JAMAIS killer une migration |
| Index manquant après nouvelle feature | `EXPLAIN ANALYZE` montre Seq Scan | Créer index `CONCURRENTLY` sur Supabase |
| Supabase plan saturé | Métriques Supabase rouges | Upgrade plan (Pro → Team) |

### Action immédiate
1. **Ne pas redéployer** — ça ne résoudra rien si la DB est le problème
2. Annuler les requêtes longues : `SELECT pg_cancel_backend(<pid>)`
3. Si la DB est carrément down → Supabase Dashboard → Restart project (downtime ~30 sec)
4. **Read-replica** : si configuré (voir `docs/READ_REPLICA.md`), basculer les lectures dessus

### Rollback
Restore depuis backup PITR (Point-In-Time Recovery Supabase) — voir `docs/RESTORE_DRILL.md`.

---

## 3. Paiement bloqué

**Symptômes :** facture passe en `PARTIALLY_PAID` au lieu de `PAID`, `paidAmount > amount`, allocation incomplète des Payment → InvoiceItem.

### Diagnostic
```sql
-- Factures incohérentes (paidAmount > amount)
SELECT id, "invoiceNumber", amount, "paidAmount", status
FROM "Invoice"
WHERE "paidAmount" > amount + 0.01;

-- Items sans allocation après paiement
SELECT ii.id, ii.description, ii.total, ii."allocatedAmount", i."paidAmount", i.amount
FROM "InvoiceItem" ii
JOIN "Invoice" i ON ii."invoiceId" = i.id
WHERE i.status = 'PAID' AND ii."allocatedAmount" < ii.total;

-- Drift Invoice.amount vs SUM(items.total)
SELECT i.id, i.amount, COALESCE(SUM(ii.total), 0) AS items_sum
FROM "Invoice" i
LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
GROUP BY i.id, i.amount
HAVING ABS(i.amount - COALESCE(SUM(ii.total), 0)) > 0.01;
```

### Causes fréquentes
| Cause | Indice | Fix |
|---|---|---|
| `allocatePayments` n'a pas tourné | `allocatedAmount = 0` sur items | Re-trigger via `POST /api/admin/invoices/[id]/recompute` |
| Trigger PG `trg_recompute_invoice_amount` désactivé | Drift `amount` vs `SUM(items)` | Vérifier `pg_trigger`, réactiver |
| `version` conflict (optimistic lock) | Sentry : `RecordNotFound` sur update Invoice | Replayer l'action côté admin |
| CHECK constraint `paidAmount <= amount + 0.01` violée | Insert payment fail | Réduire le payment ou créditer un nouveau item |

### Action immédiate
1. **Geler les écritures** sur la facture : `UPDATE "Invoice" SET status='CANCELLED' WHERE id='…'` (tempo)
2. Identifier le delta : `amount - paidAmount`
3. Soit créer un Payment manquant, soit créditer un item DISCOUNT
4. Re-trigger `allocatePayments(invoiceId)` via la console admin
5. Dégeler en repassant `status = 'PENDING' | 'PARTIALLY_PAID' | 'PAID'` selon le résultat

### Vérification post-fix
`/admin/health` doit afficher 0 invariants en alerte sur la section Invoices.

---

## 4. Cron qui ne tourne plus

**Symptômes :** `/admin/health` montre "Dernière exécution" > 24h sur un cron, pas de SMS/email reçu.

### Causes
| Cause | Fix |
|---|---|
| `CRON_SECRET` rotaté côté Vercel sans MAJ env | Re-set la var, redeploy |
| Vercel a désactivé le cron (plan downgrade) | Vérifier Vercel → Settings → Crons |
| Redis lock jamais relâché | `DEL cron:<name>:<period>` via Upstash CLI |
| BullMQ queue saturée | `/admin/queues` → Retry jobs failed |

### Action immédiate
1. Trigger manuel : `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/<name>`
2. Lire la réponse — l'endpoint retourne `{ ok, processed, errors }` détaillé
3. Si DLQ a des jobs : `/admin/queues` → Retry

---

## 5. Storage / upload KO

**Symptômes :** photos qui ne s'affichent pas, 500 sur `/api/uploads`, "File not found" sur signed URLs.

### Causes
| Cause | Fix |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` expirée | Régénérer dans Supabase Dashboard → Settings → API |
| Bucket `uploads` ou `uploads-private` supprimé | Recréer manuellement (public=true / false) |
| Quota storage dépassé | Upgrade plan Supabase |
| Signed URL expirée (>1h) | Recharger la page — Next régénère côté serveur |

### Action immédiate
1. Tester un upload via `/admin/clients` → ajouter document
2. Si KO : `SELECT * FROM storage.buckets;` côté Supabase doit lister les 2 buckets
3. RLS policy sur `uploads-private` : `SELECT * FROM storage.policies WHERE bucket_id='uploads-private';` doit contenir une policy `service_role only`

---

## 6. SMS / Email non envoyés

**Symptômes :** clients ne reçoivent rien, queue BullMQ qui grossit.

### Diagnostic
```
/admin/queues  → compteurs waiting / active / failed / DLQ
```

### Causes
| Cause | Fix |
|---|---|
| `UPSTASH_REDIS_HOST` / `PASSWORD` incorrects | Vérifier Vercel env, doit être l'host TCP (≠ URL REST) |
| Provider SMS/email down | Vérifier status page du provider |
| Worker cron `process` désactivé | `vercel.json` doit avoir `* * * * *` pour `/api/workers/process` |
| Jobs en DLQ | `/admin/queues` → Retry, ou investiguer payload corrompu |

### Action immédiate
1. Re-trigger manuel : `curl -X POST -H "x-cron-secret: …" /api/workers/process`
2. Si > 100 jobs waiting : monter `MAX_JOBS_PER_QUEUE` temporairement

---

## 7. Sentry burst (>100 events/min)

**Symptômes :** Sentry alert "High volume", AI Guardian crée trop d'issues GitHub.

### Action
1. Vérifier `/admin/guardian` — quel groupe de events ?
2. Si bug code récent : rollback déploiement
3. Si bruit (AbortError, ResizeObserver) : ajouter filtre dans `sentry.client.config.ts` → `beforeSend`
4. Guardian a un rate-limit interne (3 occ/24h avant issue) — pas besoin de paniquer

---

## Contacts d'escalade

| Domaine | Contact | SLA |
|---|---|---|
| Supabase | support@supabase.io | Pro plan : 4h |
| Vercel | support via dashboard | Pro plan : 24h |
| Upstash | support@upstash.com | 24h |
| Anthropic API | support@anthropic.com | 24h |

---

## Post-incident

1. **Toujours** consigner dans `HISTORY.md` : symptôme, cause, fix, durée
2. Ajouter le cas à ce RUNBOOK si récurrent
3. Si root cause systémique : ouvrir une issue GH avec label `postmortem`
