// k6 — Admin dashboard perf
//
// Goal : 10 VUs concurrents GET /fr/admin/dashboard, P95 < 2s.
//
// Pré-requis :
//   - K6_BASE_URL
//   - K6_ADMIN_TOKEN

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.K6_ADMIN_TOKEN || '';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 10 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE}/fr/admin/dashboard`, {
    headers: { 'Cookie': `next-auth.session-token=${TOKEN}` },
    tags: { name: 'GET /fr/admin/dashboard' },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'returns HTML': (r) => (r.headers['Content-Type'] || '').includes('text/html'),
    'not a login redirect': (r) => !r.url.includes('/signin'),
  });

  sleep(1);
}
