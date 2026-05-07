# Load testing — k6

Scénarios k6 pour valider les SLA de Dog Universe sous charge.

## Installation

```bash
# macOS
brew install k6

# Linux
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Variables d'environnement

| Variable          | Description                                  |
|-------------------|----------------------------------------------|
| `BASE_URL`        | Origine cible (ex: `https://staging.doguniverse.ma`) |
| `ADMIN_EMAIL`     | Email d'un compte ADMIN ou SUPERADMIN        |
| `ADMIN_PASSWORD`  | Mot de passe admin                           |
| `CLIENT_EMAIL`    | Email d'un compte CLIENT                     |
| `CLIENT_PASSWORD` | Mot de passe client                          |

## Exécution

```bash
# Booking + history (mixte admin/client)
k6 run e2e/load/booking-flow.js

# Billing read-only (admin seulement)
k6 run e2e/load/billing-readonly.js

# /api/availability (route publique cachée, 100 RPS)
k6 run e2e/load/availability.js
```

## SLA cibles

| Scénario           | p95          | Error rate |
|--------------------|--------------|------------|
| booking-flow       | < 1500 ms    | < 1%       |
| billing-readonly   | < 1500 ms    | < 1%       |
| availability       | < 1500 ms (p99 < 3s) | < 1%       |

Les seuils sont définis dans chaque script (option `thresholds`). Un build k6 échoue si un seuil est franchi.

## Quand lancer

- **Avant chaque release majeure** : valider qu'aucune régression de perf n'est introduite.
- **Après une migration DB** : vérifier l'impact des nouveaux indexes / changements de schéma.
- **Mensuellement sur staging** : monitorer la dérive.

## Environnements

Ne jamais lancer ces scripts contre la prod sans accord — ils peuvent générer des données de test (bookings) qu'il faudra purger ensuite. Préférer un environnement staging avec une DB dédiée.
