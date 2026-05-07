/**
 * k6 load test — admin billing read-only hot path.
 *
 * Pic d'admins qui consultent /admin/billing en parallèle.
 *
 * SLA thresholds:
 *   - p95 < 1500ms
 *   - error rate < 1%
 *
 * Run:
 *   BASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... k6 run e2e/load/billing-readonly.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL;
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD;

export const options = {
  vus: 25,
  duration: '3m',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    errors: ['rate<0.01'],
  },
};

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.cookies;
}

export default function () {
  const cookies = login();

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  const billing = http.get(`${BASE_URL}/api/admin/billing?month=${month}`, { cookies });
  check(billing, { 'billing 200': (r) => r.status === 200 }) || errorRate.add(1);

  const analytics = http.get(`${BASE_URL}/api/admin/analytics?month=${month}`, { cookies });
  check(analytics, { 'analytics 200': (r) => r.status === 200 }) || errorRate.add(1);

  sleep(2);
}
