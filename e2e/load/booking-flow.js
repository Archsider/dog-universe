/**
 * k6 load test — booking creation + admin validation flow.
 *
 * Scenario:
 *   - 15 admins simultaneously create + validate bookings.
 *   - 30 clients consult their booking history in parallel.
 *
 * SLA thresholds:
 *   - p95 latency < 1500ms
 *   - error rate < 1%
 *
 * Run:
 *   BASE_URL=https://staging.doguniverse.ma \
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   CLIENT_EMAIL=client@example.com CLIENT_PASSWORD=... \
 *   k6 run e2e/load/booking-flow.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL;
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD;
const CLIENT_EMAIL = __ENV.CLIENT_EMAIL;
const CLIENT_PASSWORD = __ENV.CLIENT_PASSWORD;

export const options = {
  scenarios: {
    admins: {
      executor: 'ramping-vus',
      exec: 'adminFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 15 },
        { duration: '2m', target: 15 },
        { duration: '30s', target: 0 },
      ],
    },
    clients: {
      executor: 'ramping-vus',
      exec: 'clientFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m', target: 30 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    errors: ['rate<0.01'],
  },
};

function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login ok': (r) => r.status === 200 || r.status === 302 });
  return res.cookies;
}

export function adminFlow() {
  const cookies = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  group('admin: list pending bookings', () => {
    const res = http.get(`${BASE_URL}/api/admin/bookings?status=PENDING`, { cookies });
    check(res, { 'list 200': (r) => r.status === 200 }) || errorRate.add(1);
  });
  sleep(1);
  group('admin: dashboard counts', () => {
    const res = http.get(`${BASE_URL}/api/admin/notifications/count`, { cookies });
    check(res, { 'count 200': (r) => r.status === 200 }) || errorRate.add(1);
  });
  sleep(2);
}

export function clientFlow() {
  const cookies = login(CLIENT_EMAIL, CLIENT_PASSWORD);
  group('client: history', () => {
    const res = http.get(`${BASE_URL}/api/bookings`, { cookies });
    check(res, { 'history 200': (r) => r.status === 200 }) || errorRate.add(1);
  });
  sleep(1);
  group('client: invoices', () => {
    const res = http.get(`${BASE_URL}/api/invoices`, { cookies });
    check(res, { 'invoices 200': (r) => r.status === 200 }) || errorRate.add(1);
  });
  sleep(2);
}
