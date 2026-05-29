# HANDOFF — État au 2026-05-28

> Document de passation rapide. Pour le contexte complet voir [CLAUDE.md](./CLAUDE.md).

---

## 🎯 État de l'app

**Tests** : **~1919 passing**, 31 skipped (E2E sans secrets) · `tsc` + `lint` clean
**Stack** : Next.js 15.5.18 · React 19 · Prisma 5.22 · Node 22 · Postgres Supabase
**Déployé sur** : `https://app.doguniverse.ma` (Vercel — auto-deploy à chaque push sur `main`)
**Branch active** : `main`

---

## 🆕 À faire / vérifier en priorité (session 2026-05-28)

### 1. Vérifier à l'écran les changements UI facturation (non testés en navigateur)

Beaucoup de changements **visuels** ont été livrés sans validation navigateur (sandbox). Recharge `app.doguniverse.ma` (cache !) et vérifie :
- **Édition facture** (bouton Modifier) : lignes en **cartes** + recherche produit quand catégorie = Croquettes/Produits + Qté éditable (ne repasse plus à 1).
- **PDF** : montants à jour (aperçu œil) + mention **« Arrêtée la présente facture à la somme de … »** en lettres.
- **Fiche facture** : boutons **« Dupliquer »** + **« Envoyer par email »**.
- **Walk-in** : ligne Pension avec **dates Arrivée/Départ** qui calculent les nuits.

Si l'éditeur relooké (#262) ne plaît pas → revert 1 fichier (`InvoiceItemsTable.tsx`).

### 2. Re-deploy Vercel pour activer les crons (toujours en attente)

`morning-digest` (06h UTC) + `vaccine-reminders` (08h UTC) sont dans `vercel.json` → un deploy les active. Le watchdog `cron-freshness` alerte par SMS SUPERADMIN si l'un ne tourne pas sous 48h.

### 3. Règle compta à appliquer (date de paiement)

**`paymentDate` = date où l'argent arrive en banque** (pas la date où le client a payé). TPE/virement de fin de mois encaissés le mois suivant → date du mois suivant (l'app accepte une date future). Garantit app = relevé bancaire = déclaration fiscale. Voir CLAUDE.md §ÉTAT 2026-05-28.

---

## ⚡ Actions plus anciennes — vérifier si encore en attente

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

## 📋 PRs mergées récemment

**Session 2026-05-28 (facturation, #255→#262)** :

| PR | Sujet |
|---|---|
| #255 | Qté éditable + recherche produit (édition facture) + dates walk-in |
| #256 | Aperçu PDF périmé après édition (cache-buster `&v=version`) |
| #257 | Audit : PDF HT/TVA + lignes partielles + dates Casa + 409 self-heal + cap pets + RGPD claims |
| #258 | Montant en toutes lettres sur le PDF (conformité Maroc) |
| #259 | Doc : `total` client intentionnel sur POST /api/invoices |
| #260 | Dupliquer une facture en 1 clic |
| #261 | Envoyer la facture PDF par email (pièce jointe) |
| #262 | Éditeur de lignes de facture relooké (mobile-first) |

**Session 2026-05-25 (#235→#253)** : taxi zombies (P0), recalcul prix COMPLETED (P0), WhatsApp impayés, digest matinal enrichi, dates alternatives quand complet, rappel vaccin J-30. Voir [HISTORY.md](./HISTORY.md).

**Session 2026-05-20 (#185→#194)** : 10 PRs (waves P0/P1, cockpit admin, Web Push, maintenance ops). Voir [HISTORY.md](./HISTORY.md).

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

*Document mis à jour 2026-05-28. Tient lieu de passation propre pour la prochaine session.*
