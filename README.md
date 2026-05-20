# Dog Universe

[![CI](https://github.com/Archsider/dog-universe/actions/workflows/ci.yml/badge.svg)](https://github.com/Archsider/dog-universe/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1725%20passing-success)](./src)
[![Audit](https://img.shields.io/badge/audit-87%2F100-blue)](./docs/AUDIT_2026_05_20.md)

Application web de gestion de pension pour animaux (chiens et chats) basée à Marrakech.

**Stack** : Next.js 15 · React 19 · Prisma 5 · PostgreSQL (Supabase) · NextAuth · next-intl (fr/en/ar)
**Déploiement** : Vercel
**Posture** : observability best-in-class · 15 invariants DB horaires · 9 ESLint rules métier bloquantes CI · TOTP AES-256-GCM · DR backups daily

## Démarrage

```bash
npm install
npx prisma generate
npm run dev
```

## Features principales

### Espace client (luxe)
- 🎴 **Member Card holographique** (tilt gyroscope + reflet doré PLATINUM)
- 📅 **Countdown J-X** avec barre interactive + mood builder (jouet/treat/musique)
- 🎉 **Tier-up celebration modal** confettis quand promotion fidélité
- 📔 **Pet Passport** luxe (carnet santé style ID page)
- 🚗 **Live Pet Taxi banner** (statut + lien tracking real-time)
- 📍 **Geofencing arrival** ("Je suis arrivé" → SMS auto admin)
- 📝 **Briefing J-2** pre-stay (form 6 champs envoyé 48h avant)
- 🎁 **Year Wrapped** Spotify-style fin d'année
- 🛍 **Boutique filtrée par espèce** du booking + search + chips catégories

### Backoffice (cockpit)
- 🎛 **Dashboard live** polling 30s + pulse anims + Stats Hero animé (CA, séjours, occupation)
- ⌘K **Command Palette** recherche universelle clients/résas/factures/pets
- ⚡ **Quick Actions Bar** sticky (Nouvelle résa / Walk-in / Encaisser / Clients)
- 📥 **Inbox unifié** `/admin/inbox` — tout ce qui attend ton action
- 📋 **Activity Feed** `/admin/activity` — timeline chronologique avec icons
- 🔧 **Maintenance ops** `/admin/maintenance` — diagnostics DB + purges + VACUUM
- 🤖 **AI Guardian Sentry** classify + auto-issue GH
- 💚 **/admin/health** + 15 invariants DB checkés chaque heure
- 🔔 **Web Push notifications** (nouvelle résa → push admin sur tel)

### Reliability
- 💾 **DB backups daily** avec rétention 30j + bucket dédié `db-backups`
- 📡 **Heartbeat self-monitoring** every 5min + page publique `/status`
- 🚨 **SMS SUPERADMIN** sur 4 incidents (heartbeat KO, invariants critical, backup stale, cron stale)
- 🛡 **Boot env guard** hard-fail prod si var critique manquante
- 🔁 **Cron freshness watchdog** alerte si cron jamais fire après 48h

## Documentation

Voir [`CLAUDE.md`](./CLAUDE.md) pour l'architecture complète, conventions, et historique.

- [`HISTORY.md`](./HISTORY.md) — log détaillé des sessions
- [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) — source de vérité métier
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — incident response par symptôme
- [`docs/SCHEMA.md`](./docs/SCHEMA.md) — modèles Prisma (42 modèles, 8 enums)
- [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) — process migrations
- [`docs/CRON_RECOVERY.md`](./docs/CRON_RECOVERY.md) — debug crons
- [`docs/BACKUP_RESTORE.md`](./docs/BACKUP_RESTORE.md) — drill DR
- [`docs/UPTIME.md`](./docs/UPTIME.md) — self-monitoring
- [`docs/AUDIT_2026_05_20.md`](./docs/AUDIT_2026_05_20.md) — audit engineering 87/100

## Commandes essentielles

```bash
npm run dev              # Lance Next.js en dev (port 3000)
npm run lint             # ESLint via next lint (9 règles métier bloquantes)
npx tsc --noEmit         # Vérification TypeScript
npx vitest run           # 1725 tests
npm run db:generate      # prisma generate (sans connexion DB)
npm run db:doc           # Regenerate docs/SCHEMA.md
npm run build            # next build
```
