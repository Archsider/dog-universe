# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Mémoire permanente de projet — ne jamais supprimer une ligne sans accord explicite.

---

## COMMANDES ESSENTIELLES

```bash
# Développement
npm run dev              # Lance Next.js en mode dev (port 3000)
npm run lint             # ESLint via next lint
npx tsc --noEmit         # Vérification TypeScript — TOUJOURS avant commit

# Base de données
npm run db:generate      # prisma generate (sans connexion DB — régénère le client TS)
npm run db:migrate       # prisma migrate dev (nécessite DB locale)
npm run db:push          # prisma db push (sync schema sans migration)
npm run db:studio        # Prisma Studio (UI de la DB)

# Build
npm run build            # next build (échoue sur Google Fonts sans réseau — normal en sandbox)
```

**Important DB** : la DB locale (`localhost:5432`) est inaccessible en environnement sandbox.
`npx prisma generate` (= `npm run db:generate`) fonctionne sans connexion et suffit pour régénérer le client TypeScript après modification du schema.
Les migrations sont créées manuellement dans `prisma/migrations/YYYYMMDD_nom/migration.sql`.

---

## CONTEXTE PROJET

**Dog Universe** est une application web de gestion de pension pour animaux (chiens et chats), basée au Maroc.
- Stack : **Next.js 15 App Router**, **Prisma**, **PostgreSQL (Supabase)**, **NextAuth**, **next-intl** (fr/en)
- Déploiement : **Vercel**
- Devises : **MAD (Dirhams marocains)** — toujours afficher avec `formatMAD()`
- Deux rôles principaux : `ADMIN` / `SUPERADMIN` (backoffice) et `CLIENT` (espace client)
- Le rôle `SUPERADMIN` a accès à la gestion des utilisateurs (`/admin/users`) — ADMIN non

---

## ARCHITECTURE CLÉS

### Structure des routes
```
src/app/[locale]/
  admin/          → backoffice (protégé ADMIN/SUPERADMIN)
  client/         → espace client (protégé CLIENT)
src/app/api/      → API routes Next.js
src/components/
  layout/         → AdminSidebar, ClientSidebar
  shared/         → composants réutilisables (MemberCard, LoyaltyBadge, etc.)
  ui/             → composants shadcn/ui
src/lib/
  prisma.ts       → instance Prisma singleton
  loyalty.ts      → logique grades fidélité
  upload.ts       → upload fichiers (Supabase Storage prod / filesystem dev)
  supabase.ts     → client Supabase admin (Storage)
```

### Base de données — modèles Prisma
| Modèle | Rôle |
|---|---|
| `User` | Clients et admins |
| `Pet` | Animaux (chiens/chats) |
| `Booking` | Réservations (BOARDING / PET_TAXI) |
| `Invoice` | Factures |
| `LoyaltyGrade` | Grade fidélité par client (1-to-1 avec User) |
| `LoyaltyBenefitClaim` | Réclamations d'avantages fidélité |
| `Notification` | Notifications in-app |
| `AdminNote` | Notes internes admin sur clients/animaux |
| `ActionLog` | Journal d'actions |
| `ClientContract` | Contrat signé par le client |
| `StayPhoto` | Photos de séjour |

---

## SYSTÈME DE FIDÉLITÉ

### Grades et seuils (NE PAS MODIFIER sans accord)
| Grade | Séjours | Condition alternative |
|---|---|---|
| BRONZE | 1–3 | — |
| SILVER | 4–9 | — |
| GOLD | 10–19 | — |
| PLATINUM | 20+ | OU ≥ 55 000 MAD de CA |

- Le grade est calculé automatiquement via `calculateSuggestedGrade()` dans `src/lib/loyalty.ts`
- L'admin peut **toujours** faire un override manuel (`isOverride: true` dans `LoyaltyGrade`)
- Les seuils internes ne sont **jamais** affichés au client

### Avantages (`GRADE_BENEFITS` dans `loyalty.ts`)
Chaque avantage a un `key` unique, `labelFr`, `labelEn`, et `claimable: boolean`.
- `claimable: false` → avantage automatique (ex: priorité de réservation), juste affiché
- `claimable: true` → le client peut cliquer "Réclamer", crée un `LoyaltyBenefitClaim` en statut `PENDING`

### Réclamations d'avantages (`LoyaltyBenefitClaim`)
- Statuts : `PENDING` → `APPROVED` ou `REJECTED` (avec raison obligatoire)
- API client : `POST/GET /api/loyalty/claims`
- API admin : `GET /api/admin/loyalty/claims` + `PATCH /api/admin/loyalty/claims/[id]`
- Page admin : `/admin/loyalty` avec tabs filtrables et badge en sidebar

---

## CARTE MEMBRE (`MemberCard`)

Composant : `src/components/shared/MemberCard.tsx`

**Props requises :**
```ts
clientId: string        // pour le QR code
clientName: string
pets: { name: string; species: string }[]  // PAS un seul pet, le tableau entier
grade: Grade
totalStays: number
totalSpentMAD: number
locale: string
claims: { benefitKey: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]
```

**Règles visuelles :**
- 4 styles distincts : BRONZE (tons caramel), SILVER (tons violet-gris), GOLD (tons dorés), PLATINUM (fond sombre `#141428` avec accents `#D4AF37`)
- QR code unique en haut à droite (composant `MemberQRCode`, encode `du:client:{clientId}`)
- Affichage des animaux groupé par espèce : `"Max · Luna (2 chiens) — Milo (chat)"`
- Section avantages en deux blocs : automatiques (dot) / à réclamer (bouton interactif)
- Barre de progression vers le grade suivant

---

## UPLOAD DE FICHIERS

**Règle absolue : ne jamais écrire en filesystem en production.**

`src/lib/upload.ts` détecte automatiquement l'environnement :
```
Si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sont définis
  → Supabase Storage (bucket "uploads", dossiers pets/ documents/ stays/)
  → retourne une URL publique permanente
Sinon (dev local)
  → writeFile dans public/uploads/ (gitignored)
  → retourne /uploads/subfolder/filename
```

`src/lib/supabase.ts` contient `uploadBuffer(buffer, key, mimeType)` — toujours utiliser cette fonction pour les nouveaux types d'upload.

**Variables d'env Supabase nécessaires en production :**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (défaut : `"uploads"`)

---

## SYSTÈME DE NOTIFICATIONS IN-APP

Modèle `Notification` avec champ `type`. Types existants :
```
BOOKING_CONFIRMATION | BOOKING_VALIDATION | BOOKING_REFUSAL
STAY_REMINDER | INVOICE_AVAILABLE | ADMIN_MESSAGE | STAY_PHOTO
LOYALTY_UPDATE | PET_BIRTHDAY
```

Chaque notification a `titleFr`, `titleEn`, `messageFr`, `messageEn`, `metadata` (JSON string).

Page notifications : `src/app/[locale]/client/notifications/page.tsx`
Le `TYPE_CONFIG` dans cette page définit l'icône et la couleur par type — **toujours y ajouter le nouveau type** lors de la création d'un type de notification.

---

## CRONS (Vercel)

Définis dans `vercel.json`, tous à **08h00 UTC** :
| Route | Fréquence | Rôle |
|---|---|---|
| `/api/cron/reminders` | Quotidien | Rappels de séjour |
| `/api/cron/birthday-notifications` | Quotidien | Notifications anniversaire des animaux |

**Protection :** header `x-cron-secret` vérifié contre `CRON_SECRET` (déjà défini sur Vercel).
Vercel l'injecte automatiquement via `Authorization: Bearer` pour ses propres crons.

### Logique anniversaire
- Requête SQL raw `EXTRACT(MONTH)` + `EXTRACT(DAY)` sur `Pet.dateOfBirth`
- Déduplication : pas de double envoi si déjà envoyé aujourd'hui pour ce pet
- Âge calculé : `today.getFullYear() - dateOfBirth.getFullYear()`

---

## RÈGLES FORMULAIRES ANIMAUX

**`dateOfBirth` est OBLIGATOIRE** sur tous les formulaires (client et admin) depuis la session du 2026-03-08.
- Validation JS en frontend (toast d'erreur explicite)
- Champ marqué `*` dans le label
- Raison : calcul automatique de l'âge + anniversaires automatiques

---

## CONVENTIONS DE CODE

- **Langue des variables/fonctions** : anglais
- **Langue de l'UI** : fr/en via `next-intl` (toujours les deux)
- **Composants server** : pages Next.js par défaut (pas de `'use client'` sauf nécessaire)
- **Composants client** : préfixés `'use client'`, nommés avec suffixe `Manager`, `Button`, `Modal` si interactifs
- **Prisma** : toujours utiliser l'instance singleton de `src/lib/prisma.ts`
- **Migrations** : si DB locale inaccessible, créer le SQL manuellement dans `prisma/migrations/YYYYMMDD_nom/migration.sql` et fournir le SQL à exécuter sur Supabase
- **Zéro TypeScript errors** : toujours vérifier avec `npx tsc --noEmit` avant commit
- **Formatage monétaire** : toujours `formatMAD()` de `src/lib/utils`
- **Dates** : `formatDate()` ou `formatDateShort()` de `src/lib/utils`

---

## SIDEBAR ADMIN

`src/components/layout/AdminSidebar.tsx` — props :
```ts
pendingCount: number         // réservations PENDING → badge amber sur "Réservations"
pendingClaimsCount: number   // claims PENDING → badge gold sur "Réclamations fidélité"
userRole: string             // 'ADMIN' | 'SUPERADMIN'
```

Compteurs chargés dans `src/app/[locale]/admin/layout.tsx` via `Promise.all`.

---

## SYSTÈME DE RÉSERVATIONS — WORKFLOWS ET STATUTS

### Statuts DB (`Booking.status`)
`PENDING` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED` (flux normal)
`CANCELLED` / `REJECTED` (sortie possible à tout moment par l'admin)

**Important** : `IN_PROGRESS` doit être présent dans `VALID_STATUSES` de `PATCH /api/admin/bookings/[id]`. Ne jamais l'omettre.

### Pipelines affichés (labels UI ≠ statuts DB)
| Statut DB   | Pension (BOARDING)      | Pet Taxi (PET_TAXI)       |
|-------------|-------------------------|---------------------------|
| PENDING     | Demande reçue           | Transport planifié        |
| CONFIRMED   | Séjour confirmé         | Chauffeur en route        |
| IN_PROGRESS | Dans nos murs           | Animal à bord             |
| COMPLETED   | Séjour terminé          | Arrivé à destination      |

### Board Kanban admin (`ReservationsKanban.tsx`)
- Centralisé dans `NEXT_STATUS` (transitions) et `ACTION_LABELS` (boutons) — ne jamais coder les statuts en dur ailleurs
- Chaque carte a un bouton d'action contextuel → `PATCH /api/admin/bookings/{id}`
- Mise à jour **optimiste** : `useState` local sur les bookings, la carte se déplace immédiatement sans rechargement
- Le clic bouton `stopPropagation()` pour ne pas naviguer vers la fiche

### Fiche admin (`ReservationActions.tsx`)
- Bouton principal = prochaine étape du pipeline
- Section "Forcer un statut" masquée par défaut (dépliable) avec select complet
- Reçoit `serviceType` en prop (obligatoire pour déterminer le pipeline)

### Fiche client (`client/bookings/[id]/page.tsx`)
- Server Component — ne se re-render pas automatiquement
- `AutoRefresh` (`src/components/shared/AutoRefresh.tsx`) ajouté pour les réservations actives : appelle `router.refresh()` toutes les 30s
- Stepper visuel lecture seule : étapes passées ✓ / active surlignée / futures grisées
- Le client ne peut **jamais** modifier le statut

### Contraintes Pet Taxi (front + back)
- **Dimanche interdit** : `isValidTaxiDate()` dans le formulaire client
- **Horaires 10h-17h uniquement** : `isValidTaxiTime()` dans le formulaire client
- Validation dupliquée côté backend dans `POST /api/bookings` :
  - `SUNDAY_NOT_ALLOWED` → 400
  - `INVALID_TIME_SLOT` → 400
- S'applique au taxi standalone ET aux addons taxi d'une pension

---

## HISTORIQUE ET DÉCISIONS CLÉS

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
