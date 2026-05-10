# Load tests k6

Scénarios de charge pour valider la robustesse production (concurrence, idempotence, perf).

## Pré-requis

- **k6 binary** : https://k6.io/docs/get-started/installation/
  - macOS : `brew install k6`
  - Linux : `sudo apt install k6` (après ajout du repo officiel)
- **Variables d'env** :
  - `K6_BASE_URL` — URL de la cible (ex: `https://app.doguniverse.ma`, jamais la prod par défaut)
  - `K6_ADMIN_TOKEN` — cookie `next-auth.session-token` d'un compte ADMIN/SUPERADMIN
  - `K6_CLIENT_TOKEN` — cookie `next-auth.session-token` d'un compte CLIENT
  - Spécifiques :
    - `K6_PET_ID` (booking-concurrent)
    - `K6_DOG_CAPACITY` (booking-concurrent — défaut 5)
    - `K6_INVOICE_ID` (invoice-payment-race)
    - `K6_TAXI_TOKEN` (taxi-heartbeat-stress)

## Récupérer un cookie de session

```bash
# Login via UI, ouvrir DevTools > Application > Cookies
# Copier la valeur du cookie `next-auth.session-token` (ou `__Secure-next-auth.session-token` en HTTPS)
export K6_ADMIN_TOKEN="eyJhbGc..."
```

## Lancer

```bash
# 1. Concurrence booking (50 VU, 105s)
K6_BASE_URL=... K6_CLIENT_TOKEN=... K6_PET_ID=... \
  k6 run tests/k6/booking-concurrent.js

# 2. Race condition paiements + Idempotency-Key (30 VU, 105s)
K6_BASE_URL=... K6_ADMIN_TOKEN=... K6_INVOICE_ID=... \
  k6 run tests/k6/invoice-payment-race.js

# 3. Stress heartbeat taxi (20 VU @ 1Hz, 105s)
K6_BASE_URL=... K6_TAXI_TOKEN=... \
  k6 run tests/k6/taxi-heartbeat-stress.js

# 4. Perf dashboard admin (10 VU, 105s)
K6_BASE_URL=... K6_ADMIN_TOKEN=... \
  k6 run tests/k6/dashboard-perf.js
```

## Seuils de succès

Tous les scripts partagent :

```js
thresholds: {
  'http_req_duration{expected_response:true}': ['p(95)<2000'],
  'http_req_failed': ['rate<0.01'],
}
```

| Script | Critère métier additionnel |
|---|---|
| booking-concurrent | `booking_success <= K6_DOG_CAPACITY` (aucun double-booking) ; `booking_server_error == 0` |
| invoice-payment-race | `paidAmount` final en DB == `payment_accepted × 10 MAD` ; 4× 409 sur les 5 VUs partageant l'idemp-key |
| taxi-heartbeat-stress | `heartbeat_5xx == 0` ; P95 < 2s sous 20 VUs |
| dashboard-perf | `http_req_duration p(95) < 2000` ; aucune redirection vers `/signin` |

## Interprétation

- **k6 résume P50/P90/P95/P99** automatiquement à la fin. Croiser avec Vercel Analytics / Sentry sur la même fenêtre.
- **Erreurs 5xx > 0** → investiguer dans Sentry (search par `transaction:POST /api/bookings` etc.).
- **Booking concurrency : success > capacity** → bug critique de la transaction Serializable, ouvrir un incident.
- **Invoice race : sum payments != paidAmount DB** → bug du trigger PG `trg_recompute_invoice_amount`.

## CI

Ces scripts ne sont **pas exécutés automatiquement** (nécessite cibles + secrets). À lancer manuellement avant chaque release majeure, ou en staging dédié.
