/**
 * k6 load test — public /api/availability under sustained 100 RPS.
 *
 * Cette route est publique, cachée 5 min en Redis.
 * On valide que le cache absorbe le pic sans toucher la DB.
 *
 * SLA thresholds:
 *   - p95 < 1500ms (cache hit devrait être < 100ms)
 *   - error rate < 1%
 *
 * Run:
 *   BASE_URL=... k6 run e2e/load/availability.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    errors: ['rate<0.01'],
  },
};

const SPECIES = ['DOG', 'CAT'];

function nextMonths(n) {
  const months = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const MONTHS = nextMonths(3);

export default function () {
  const species = SPECIES[Math.floor(Math.random() * SPECIES.length)];
  const month = MONTHS[Math.floor(Math.random() * MONTHS.length)];

  const res = http.get(`${BASE_URL}/api/availability?species=${species}&month=${month}`);
  check(res, {
    'availability 200': (r) => r.status === 200,
    'has body': (r) => r.body && r.body.length > 0,
  }) || errorRate.add(1);

  sleep(0.1);
}
