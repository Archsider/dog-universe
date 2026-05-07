# Restore drill — procédure mensuelle

## Pourquoi

Une sauvegarde n'a de valeur que si on a **vérifié qu'elle est restaurable**.
Trop d'équipes apprennent que leur backup est corrompu / incomplet le jour
de l'incident. Cette procédure de drill (~15 min/mois) détecte le problème
en avance.

## Pré-requis

- Un projet Supabase staging dédié au drill (pas la prod !).
  Variable : `RESTORE_TARGET_DATABASE_URL` = connection string de ce projet.
- Accès au bucket `backups` Supabase (clé `SUPABASE_SERVICE_ROLE_KEY`).
- `node >= 20` localement.

## Procédure (~15 min)

### 1. Identifier le dump du jour

Le cron de backup quotidien (à mettre en place — voir TODO bas) écrit dans
`backups/YYYY-MM-DD.json` au format :

```json
{
  "createdAt": "2026-05-07T03:00:00Z",
  "tables": {
    "User": [...],
    "Pet": [...],
    ...
  }
}
```

### 2. Dry-run (lecture seule, ~1 min)

```bash
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/restore-from-backup.mjs --dry-run --backup-key=backups/2026-05-07.json
```

Vérifier :
- Le dump est lisible (JSON valide)
- Les counts paraissent cohérents (`User > 100`, `Booking > 500`, etc.)
- Pas d'écart majeur vs hier (chute brutale de rows = backup corrompu)

### 3. Restore réel sur staging (~5 min)

```bash
RESTORE_TARGET_DATABASE_URL="postgresql://...staging..." \
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
node scripts/restore-from-backup.mjs --backup-key=backups/2026-05-07.json
```

Le script :
1. Télécharge le dump
2. TRUNCATE les tables cibles (ordre inverse FK)
3. Re-insère les rows table par table (`createMany` Prisma)

### 4. Vérifications post-restore (~5 min)

Connexion `psql` ou Supabase Studio sur le projet staging :

```sql
-- Counts
SELECT 'User' AS t, COUNT(*) FROM "User"
UNION ALL SELECT 'Booking', COUNT(*) FROM "Booking"
UNION ALL SELECT 'Invoice', COUNT(*) FROM "Invoice"
UNION ALL SELECT 'Payment', COUNT(*) FROM "Payment";

-- Intégrité référentielle
SELECT COUNT(*) FROM "Booking" b
LEFT JOIN "User" u ON u."id" = b."clientId"
WHERE u."id" IS NULL;
-- doit être 0

-- Sanity check loyalty
SELECT COUNT(*) FROM "LoyaltyGrade" lg
LEFT JOIN "User" u ON u."id" = lg."clientId"
WHERE u."id" IS NULL;
-- doit être 0
```

### 5. Smoke test app (optionnel mais recommandé)

Pointer une instance Next.js locale vers la DB staging restaurée :

```bash
DATABASE_URL="postgresql://...staging..." npm run dev
```

Tester :
- Login admin → dashboard charge
- `/admin/billing?month=2026-04` → totaux cohérents
- `/admin/clients` → liste non vide
- `/admin/reservations` → kanban non vide

### 6. Cleanup

Le script TRUNCATE chaque mois — pas besoin de cleanup manuel. Le projet
staging peut rester en place entre les drills.

## Checklist post-drill

- [ ] Dump du jour J trouvé dans le bucket
- [ ] Dry-run OK (counts > seuils minimaux)
- [ ] Restore complet sans erreur Prisma
- [ ] Pas d'orphelin FK (queries section 4)
- [ ] App Next.js connecte à la DB restaurée
- [ ] Note de drill ajoutée à `docs/RESTORE_DRILL_LOG.md` (date, durée, anomalies)

## En cas d'échec

| Symptôme | Diagnostic | Action |
|---|---|---|
| Dump JSON inexistant | Cron de backup cassé | Vérifier cron (logs Vercel) |
| `createMany` échoue avec FK | Ordre TABLE_ORDER incorrect | Ajuster `scripts/restore-from-backup.mjs` |
| Counts << prod | Dump partiel | Vérifier le générateur de dump (export incomplet ?) |
| Decimals pétés | Cast JSON → Prisma | Convertir en string avant `createMany` |
| Dates timezone offset | UTC vs local | Forcer ISO 8601 dans le dump |

## TODO — Cron de backup

Aujourd'hui le drill dépend de l'existence d'un dump dans `backups/`. À implémenter :

- `/api/cron/backup` daily 03h UTC
- Lit chaque table prioritaire via `prisma.<model>.findMany()`
- Sérialise en JSON
- Upload vers `uploads-private` bucket key `backups/YYYY-MM-DD.json`
- Retention : garde les 30 derniers + 1 par mois sur 12 mois
- Lock Redis (idempotence cron)
