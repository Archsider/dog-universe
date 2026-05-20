# HANDOFF — État au 2026-05-20

> Document de passation rapide. Pour le contexte complet voir [CLAUDE.md](./CLAUDE.md).

---

## 🎯 État de l'app

**Note audit engineering** : **87/100** ([docs/AUDIT_2026_05_20.md](./docs/AUDIT_2026_05_20.md))
**Tests** : 1725 passing, 31 skipped (E2E sans secrets)
**Stack** : Next.js 15.5.18 · React 19 · Prisma 5.22 · Node 22 · Postgres Supabase
**Déployé sur** : `https://app.doguniverse.ma` (Vercel)
**Branch active** : `main`

---

## ⚡ À faire de TOUTE URGENCE (côté opérateur)

### 1. Migrations SQL à exécuter sur Supabase

Dans Supabase Dashboard → SQL Editor → New query → coller chacun → Run :

1. **`prisma/migrations/20260520_time_proposal_partial_unique/migration.sql`**
   - Partial UNIQUE index + auto-dedupe (atomic race guard)
2. **`prisma/migrations/20260520_invoice_paid_amount_lower_bound/migration.sql`**
   - CHECK `paidAmount >= -0.01` (defense vs refund overshoot)
3. **`prisma/migrations/20260520_push_subscription/migration.sql`**
   - Table PushSubscription pour Web Push
4. **`prisma/migrations/20260519_daily_report/migration.sql`** (encore en attente)
   - Table DailyReport pour les cards quotidiennes
5. **`prisma/migrations/20260519_lifetime_contract/migration.sql`** (optionnel)
   - Pour signature digitale Stephanie/Mama via lien HMAC

**Après chaque exécution** : `/admin/health` → bouton vert **"Déjà appliquée"** sur la ligne correspondante.

### 2. Cleanup SQL one-shot

Pour faire passer l'invariant `accepted_proposal_orphaned` à 0 :

```sql
UPDATE "TimeProposal"
SET status = 'SUPERSEDED',
    "publicToken" = NULL,
    "publicTokenExpiresAt" = NULL,
    "respondedAt" = NOW(),
    "responseNote" = '[Auto-cleanup 2026-05-20] Booking went terminal pre-Wave-2 fix.'
WHERE id = 'tp_legacy_txgo_cmp62pa2200023s5i6mgf3nag'
  AND status = 'ACCEPTED';
```

### 3. Vars Vercel à configurer

**Geofencing arrival (PR #180 — "Je suis arrivé")** :
- `NEXT_PUBLIC_PENSION_LAT` = `31.640736507465107`
- `NEXT_PUBLIC_PENSION_LNG` = `-8.201317751856138`

**Web Push notifs (PR #194)** — générer d'abord les clés en local :
```bash
npx web-push generate-vapid-keys
```
Puis sur Vercel → Settings → Environment Variables :
- `VAPID_PUBLIC_KEY` = clé publique (sortie commande)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = **même valeur**
- `VAPID_PRIVATE_KEY` = clé privée (sortie commande)
- `VAPID_SUBJECT` = `mailto:ops@doguniverse.ma`

**Après ajout** : Vercel → Deployments → **Redeploy** (sans cache) pour propager les `NEXT_PUBLIC_*`.

Puis `/admin/profile` → bouton **"Activer"** push → autorise notif browser.

---

## 🛠 Outils à utiliser au quotidien

### Bouton "Vider stamp erreur backup" 🔥
Va sur `/admin/maintenance` → Actions rapides → **"Vider stamp erreur backup"** → l'erreur "il y a 6j" disparaît.

### Sur ton tel
- **⌘K** ou **Ctrl+K** dans `/admin/*` → recherche universelle (clients/résas/factures/pets)
- **Quick Actions Bar** (sticky sous header) → 4 actions rapides
- `/admin/inbox` → backlog unifié (tout ce qui attend)
- `/admin/activity` → timeline du jour
- `/admin/maintenance` → diagnostics DB + VACUUM + purges (SUPERADMIN)
- `/admin/health` → invariants + crons + migrations status

---

## 📋 PRs mergées cette session (10 PRs)

| PR | Wave | Sujet |
|---|---|---|
| #185 | 1 | 8 P0 money + RGPD + Casa TZ + loyalty |
| #186 | 2 | 8 P1 races + double-fire |
| #188 | 3 | Perf + observability |
| #189 | 4 | 4 invariants DB additionnels |
| #187 | 5 | 7 features UX client (luxe) |
| #190 | 5b | Polish greeting + product UI refonte |
| #191 | 6 | 6 features admin cockpit |
| #192 | 6.1 | Walk-in deep-link `?walkin=open` |
| #193 | 7 | Page maintenance ops |
| #194 | 7.2 | Web Push + Storage orphans + mobile UX + E2E flake |

---

## 🚧 Roadmap restante (à attaquer quand tu veux)

### Différé de cette session

- **#8 Concierge Inbox** — chat threadé par séjour (remplace WhatsApp). Effort L. Impact L.
- **#9 Live Stay Feed Stories** — photos/vidéos du jour façon Instagram. Effort L. Impact L.

### Recommandations audit (par ROI)

**Quick wins (1-2 sessions)** :
1. Câbler **UptimeRobot externe** ping `/api/health/ping` (SPOF supprimé pour 0$)
2. **DR drill mensuel** GitHub Actions (restore dump dans DB éphémère + canary queries)
3. **3 perf wins** : `unstable_cache(getCapacityLimits)`, caps `take` admin, query filter cron

**Moyen terme (1-2 mois)** :
4. **CMI / Stripe checkout** + acompte 30% (réduit no-show + acquisition)
5. **Purge Sémantique A** (accounting.ts + metrics/revenue.ts legacy)
6. **Splitter 5 god-files** (booking-admin.service, reservations/[id]/page, etc.)

**Long terme (3-6 mois)** :
7. **App native Expo** (push généralisé + UX taxi live client)
8. **Programme parrainage** + reviews publiques SEO
9. **SLOs explicites** + on-call rotation (éliminer SPOF humain)

---

## 🆘 En cas de bug en prod

1. Va sur **`/status`** (page publique) — voir si heartbeat OK
2. Va sur **`/admin/health`** — voir invariants + crons + migrations
3. Va sur **`/admin/diagnostics`** — voir SMS + email + queues
4. Va sur **`/admin/maintenance`** → bouton "Refresh CA materialized view" (fix lag dashboard)
5. Consulte **[docs/RUNBOOK.md](./docs/RUNBOOK.md)** par symptôme
6. Si invariant critique flag → consulte **[docs/BUSINESS_RULES.md](./docs/BUSINESS_RULES.md)**
7. Si cron stale → consulte **[docs/CRON_RECOVERY.md](./docs/CRON_RECOVERY.md)**
8. Si backup KO → consulte **[docs/BACKUP_RESTORE.md](./docs/BACKUP_RESTORE.md)**

---

## 🔍 Liens utiles

- [CLAUDE.md](./CLAUDE.md) — mémoire projet complète
- [HISTORY.md](./HISTORY.md) — log détaillé sessions
- [docs/AUDIT_2026_05_20.md](./docs/AUDIT_2026_05_20.md) — audit engineering 87/100
- [docs/BUSINESS_RULES.md](./docs/BUSINESS_RULES.md) — règles métier verrouillées
- [docs/SCHEMA.md](./docs/SCHEMA.md) — 42 modèles, 8 enums (généré)
- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — incident response par symptôme

---

*Document généré 2026-05-20. Tient lieu de passation propre pour la prochaine session.*
