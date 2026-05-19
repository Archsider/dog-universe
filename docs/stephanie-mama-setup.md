# Setup Stephanie Yanik / Mama — pas-à-pas SQL + signature magic link

Procédure en 3 étapes pour activer le cas Stephanie / Mama (résidente
permanente).  Tout passe par Supabase SQL Editor pour la création des
rows ; le contrat est ensuite signé digitalement par Stephanie sur son
téléphone via un lien magique.

---

## Étape 1 — Migrations SQL

Ouvrir https://supabase.com/dashboard → projet → **SQL Editor**.

### 1.1 — `Pet.isPermanentResident`

Coller :

```sql
ALTER TABLE "Pet"
  ADD COLUMN IF NOT EXISTS "isPermanentResident" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Pet_isPermanentResident_idx"
  ON "Pet" ("isPermanentResident")
  WHERE "isPermanentResident" = true;
```

### 1.2 — Table `LifetimeContract`

Coller le contenu de `prisma/migrations/20260519_lifetime_contract/migration.sql`.
Crée l'enum `LifetimeContractStatus` + la table + 4 indexes + le trigger
`updatedAt`.  Idempotent.

---

## Étape 2 — Seed Stephanie + Mama

Toujours dans SQL Editor, coller le contenu de :

```
scripts/seed-stephanie-mama.sql
```

**Run** → en bas, les 2 SELECTs doivent afficher :

- `✓ Stephanie` — `email = stephanie.yanik+walkin@dog-universe.local`, `isWalkIn=true`
- `✓ Mama` — `species=DOG`, `gender=FEMALE`, `isNeutered=true`, `isPermanentResident=true`

---

## Étape 3 — Envoyer le lien de signature à Stephanie

Une fois la PR mergée et Vercel déployé :

1. **Admin** : aller sur `/admin/clients/{stephanie-id}` (chercher
   "Stephanie" dans la liste clients).
2. Dans la carte **Animaux**, Mama apparaît avec son chip violet 🏠
   *Résident*.
3. Sous la liste, un bouton violet : **« 🏠 Générer le lien de
   signature »** → clic.
4. Le panneau affiche :
   - Le lien complet (URL HMAC-signée, valide 30 jours)
   - Un bouton **« Copier »**
   - Un bouton **« 💬 Envoyer via WhatsApp »** (rempli avec le numéro
     de Stephanie + un message FR pré-écrit)
5. Cliquer le bouton WhatsApp ouvre WhatsApp Web/Desktop avec le
   message prêt à envoyer.

### Côté Stephanie (sur son téléphone)

1. Reçoit le lien dans WhatsApp / SMS.
2. Ouvre le lien → page publique Dog Universe.
3. Voit :
   - L'encadré identité pré-rempli (son nom + Mama + description)
   - Les 10 articles du contrat (scrollable)
   - Une case à cocher *« J'ai lu et j'accepte sans réserve »*
   - Un cadre signature où elle signe avec le doigt (sur mobile) ou la
     souris (sur desktop).  Alternative : signer par clavier (rendu
     cursif du nom).
4. Bouton **« Signer le contrat »** → envoie la signature au serveur.
5. Le PDF signé est **généré automatiquement** + uploadé dans le bucket
   privé Supabase.
6. Confirmation écran vert *« ✓ Contrat signé »* + bouton
   **« 📄 Télécharger le PDF signé »** — Stephanie a sa copie.

### Côté admin — après signature

- Le statut sur `/admin/clients/{stephanie-id}` passe à **« ✓ Contrat
  signé le X »**.
- Bouton **« 📄 Télécharger le PDF signé »** visible pour ré-télécharger
  à tout moment.
- Tout est tracé dans `ActionLog` (`CONTRACT_LIFETIME_GENERATED` et
  `CONTRACT_LIFETIME_SIGNED`).

---

## Que contient le PDF signé ?

- En-tête Dog Universe + logo + RC/IF/ICE
- Encadré identité pré-rempli (Stephanie Yanik / Mama / description)
- 10 articles : préambule, engagement à vie, résident permanent, frais
  & soins, provisions, mandat sanitaire, visites, fin de prise en
  charge, responsabilité, données + litiges
- **Signature digitale embarquée** (le tracé fait par Stephanie)
- Date + heure de signature + adresse IP
- **Cachet Dog Universe** côté droit
- Footer mentions légales

---

## Sécurité / observabilité

- Token HMAC SHA-256 signé par `LIFETIME_CONTRACT_TOKEN_SECRET` (fallback
  `NEXTAUTH_SECRET`).
- Lien valide 30 jours.
- Un seul lien actif à la fois par (client, pet) — re-générer expire
  l'ancien automatiquement.
- Re-signer un même lien renvoie 409 `ALREADY_SIGNED`.
- Lien expiré / révoqué → page d'erreur gracieuse côté Stephanie.
- PDF stocké en bucket **privé** (`uploads-private`), accessible
  uniquement via signed URL (1 h pour Stephanie post-signature, 15 min
  pour admin).

---

## Re-générer un nouveau contrat (terms modifiés, etc.)

Bouton **« Re-générer un nouveau lien (nouvelle version) »** sous le
bloc « Contrat signé ».  Crée une nouvelle row `LifetimeContract` en
PENDING — l'ancienne signature reste intacte dans la DB pour audit.

Pour modifier le texte des articles, éditer en parallèle :
- `src/lib/contract-pdf-lifetime.tsx` → constante `LIFETIME_ARTICLES`
  (rendu dans le PDF)
- `src/app/[locale]/contracts/lifetime/[token]/page.tsx` → constante
  `ARTICLES` (rendu à l'écran avant signature)

Les deux DOIVENT rester synchronisés — sinon Stephanie signe un texte
qui ne correspond pas au PDF généré.
