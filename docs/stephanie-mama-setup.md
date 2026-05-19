# Setup Stephanie Yanik / Mama — pas-à-pas SQL

Procédure manuelle en 3 étapes pour activer le cas Stephanie / Mama
(résidente permanente) en production.  Tout passe par Supabase SQL
Editor — aucun script Node nécessaire.

---

## Étape 1 — Migration : ajout du flag `isPermanentResident`

Ouvrir https://supabase.com/dashboard → projet → **SQL Editor** → coller
le contenu de :

```
prisma/migrations/20260518_pet_permanent_resident/migration.sql
```

Soit en une ligne :

```sql
ALTER TABLE "Pet"
  ADD COLUMN IF NOT EXISTS "isPermanentResident" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Pet_isPermanentResident_idx"
  ON "Pet" ("isPermanentResident")
  WHERE "isPermanentResident" = true;
```

**Run** → doit afficher `Success. No rows returned`.

---

## Étape 2 — Seed : Stephanie Yanik + Mama

Toujours dans SQL Editor, coller le contenu de :

```
scripts/seed-stephanie-mama.sql
```

**Run** → en bas, les 2 SELECTs de vérification doivent afficher :

| check_name   | name             | email                                          | isWalkIn |
|--------------|------------------|------------------------------------------------|----------|
| ✓ Stephanie  | Stephanie Yanik  | stephanie.yanik+walkin@dog-universe.local      | true     |

| check_name | name | species | gender | isNeutered | isPermanentResident | owner_name      |
|------------|------|---------|--------|------------|---------------------|-----------------|
| ✓ Mama     | Mama | DOG     | FEMALE | true       | true                | Stephanie Yanik |

Si les SELECTs renvoient 0 ligne → quelque chose a échoué, regarder les
erreurs dans la console SQL Editor.

---

## Étape 3 — Télécharger le contrat de pension à vie

1. Aller sur **/admin/clients/{stephanie-id}** (le `id` de Stephanie
   apparaît dans la première vérification de l'étape 2).  Tu peux aussi
   passer par `/admin/clients` et chercher "Stephanie".
2. Dans la carte **« Animaux »**, Mama doit apparaître avec un chip
   violet 🏠 **Résident**.
3. Sous la liste des animaux, un bouton violet apparaît :
   **« 🏠 Télécharger le contrat de pension à vie (PDF) »**.
4. Cliquer → le PDF se télécharge automatiquement.
5. Imprimer, faire signer Stephanie au stylo, archiver (et scanner dans
   ses documents pour avoir une copie numérique).

---

## Que contient le PDF ?

- En-tête Dog Universe + logo + RC/IF/ICE
- **Encadré identité** pré-rempli : Stephanie Yanik / Mama (Femelle) /
  description blanche+marron+stérilisée+identifiée
- **10 articles** spécifiques à la pension à vie :
  1. Préambule
  2. Engagement de pension à vie
  3. Statut de résident permanent
  4. Frais de pension et soins (budget géré par Dog Universe)
  5. Provisions et facturation
  6. Mandat sanitaire
  7. Visites du propriétaire
  8. Fin de prise en charge
  9. Responsabilité
  10. Données personnelles + Litiges (Marrakech)
- **Bloc signature** :
  - Côté gauche : ligne vide pour signature manuscrite de Stephanie +
    mention "Lu et approuvé" obligatoire
  - Côté droit : **cachet Dog Universe SARLAU** (l'image `private/stamp.png`)
- Footer avec mentions légales

---

## Re-générer si besoin

Le bouton peut être recliqué à tout moment.  Le PDF est généré à la
volée, jamais stocké en DB.  Chaque génération crée une entrée
`ActionLog` (`CONTRACT_LIFETIME_GENERATED`) pour l'audit.

Si tu veux modifier le texte du contrat (ajouter une clause, ajuster un
article), édite directement `src/lib/contract-pdf-lifetime.tsx` →
constante `LIFETIME_ARTICLES`.
