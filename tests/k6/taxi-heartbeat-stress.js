// k6 — Taxi heartbeat stress
//
// Goal : 20 VUs envoient un heartbeat GPS à 1 Hz pendant 60 s.
// Valide que :
//   - Le cleanup taxi-location ne sature pas la DB (P95 < 2s)
//   - Aucune 5xx
//   - Le geofencing ne crash pas même sous load
//
// Pré-requis :
//   - K6_BASE_URL
//   - K6_TAXI_TOKEN : token public d'un TaxiTrip en cours (DRIVER_EN_ROUTE)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.K6_TAXI_TOKEN || '';

const accepted = new Counter('heartbeat_ok');
const serverError = new Counter('heartbeat_5xx');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '60s', target: 20 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.01'],
    'heartbeat_5xx': ['count<1'],
  },
};

// Coordonnées autour de Casablanca avec drift ±0.01°
const BASE_LAT = 33.5731;
const BASE_LNG = -7.5898;

export default function () {
  const lat = BASE_LAT + (Math.random() - 0.5) * 0.02;
  const lng = BASE_LNG + (Math.random() - 0.5) * 0.02;
  const payload = JSON.stringify({ lat, lng, accuracy: 10, speed: 30 });

  const res = http.post(`${BASE}/api/taxi/${TOKEN}/heartbeat`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/taxi/[token]/heartbeat' },
  });

  if (res.status === 200 || res.status === 204) accepted.add(1);
  else if (res.status >= 500) serverError.add(1);

  check(res, {
    'no 5xx': (r) => r.status < 500,
  });

  sleep(1); // 1 Hz
}
