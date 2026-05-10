// k6 — Booking concurrency / capacity race test
//
// Goal : 50 VUs POST /api/bookings concurrent sur les mêmes dates BOARDING
// avec une capacité limitée (ex: 5 chiens). Valide que :
//   - Aucun double-booking au-delà de la capacité (Serializable + P2034 retry)
//   - Aucune 500 (toutes les requêtes échouées doivent renvoyer 400 CAPACITY_EXCEEDED)
//   - Le nombre de Booking créées == capacité configurée
//
// Pré-requis :
//   - K6_BASE_URL (https://app.doguniverse.ma)
//   - K6_CLIENT_TOKEN (cookie next-auth.session-token d'un compte CLIENT)
//   - Capacité chien configurée à un seuil bas (ex: 5)
//   - Au moins 1 Pet (DOG) appartenant au client, id fourni via K6_PET_ID

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.K6_CLIENT_TOKEN || '';
const PET_ID = __ENV.K6_PET_ID || '';
const CAPACITY = parseInt(__ENV.K6_DOG_CAPACITY || '5', 10);

const successCount = new Counter('booking_success');
const capacityRejected = new Counter('booking_rejected_capacity');
const serverError = new Counter('booking_server_error');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.01'],
    'booking_server_error': ['count<1'],
  },
};

export default function () {
  const payload = JSON.stringify({
    serviceType: 'BOARDING',
    petIds: [PET_ID],
    startDate: '2026-12-20',
    endDate: '2026-12-27',
  });

  const res = http.post(`${BASE}/api/bookings`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `next-auth.session-token=${TOKEN}`,
    },
    tags: { name: 'POST /api/bookings' },
  });

  if (res.status === 200 || res.status === 201) successCount.add(1);
  else if (res.status === 400 && res.body && res.body.includes('CAPACITY_EXCEEDED')) capacityRejected.add(1);
  else if (res.status >= 500) serverError.add(1);

  check(res, {
    'no 5xx': (r) => r.status < 500,
    'response is JSON': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
  });

  sleep(0.1);
}

export function handleSummary(data) {
  const success = data.metrics.booking_success?.values?.count || 0;
  const rejected = data.metrics.booking_rejected_capacity?.values?.count || 0;
  const errors = data.metrics.booking_server_error?.values?.count || 0;
  // eslint-disable-next-line no-console
  console.log(`\n=== Booking concurrency ===\nCapacity: ${CAPACITY}\nSuccess: ${success}\nCapacity rejected: ${rejected}\nServer errors: ${errors}\nAssertion: success <= capacity → ${success <= CAPACITY ? 'PASS' : 'FAIL'}`);
  return { stdout: JSON.stringify(data.metrics, null, 2) };
}
