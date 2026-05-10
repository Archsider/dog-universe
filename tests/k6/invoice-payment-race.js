// k6 — Invoice payment race + Idempotency-Key
//
// Goal : 30 VUs POST /api/invoices/[id]/payments sur la même invoice.
//   - Valider que paidAmount final == sum(payments)
//   - Les 5 premiers requests partagent une Idempotency-Key → 1 succès + 4× 409 DUPLICATE_REQUEST
//
// Pré-requis :
//   - K6_BASE_URL, K6_ADMIN_TOKEN
//   - K6_INVOICE_ID : id d'une invoice avec amount > 30 * 10 MAD

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.K6_ADMIN_TOKEN || '';
const INVOICE_ID = __ENV.K6_INVOICE_ID || '';
const SHARED_IDEMP = 'k6-shared-idemp-key-001';

const acceptedPayments = new Counter('payment_accepted');
const duplicateRejected = new Counter('payment_duplicate_409');
const serverError = new Counter('payment_server_error');

export const options = {
  stages: [
    { duration: '30s', target: 30 },
    { duration: '60s', target: 30 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.05'],
    'payment_server_error': ['count<1'],
  },
};

export default function () {
  // Premiers 5 VUs partagent l'Idempotency-Key, le reste utilise un nonce unique
  const useShared = __VU <= 5;
  const idempKey = useShared ? SHARED_IDEMP : `k6-${__VU}-${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({
    amount: 10,
    paymentMethod: 'CASH',
    paymentDate: new Date().toISOString(),
  });

  const res = http.post(`${BASE}/api/invoices/${INVOICE_ID}/payments`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `next-auth.session-token=${TOKEN}`,
      'Idempotency-Key': idempKey,
    },
    tags: { name: 'POST /api/invoices/[id]/payments' },
  });

  if (res.status === 200 || res.status === 201) acceptedPayments.add(1);
  else if (res.status === 409) duplicateRejected.add(1);
  else if (res.status >= 500) serverError.add(1);

  check(res, {
    'no 5xx': (r) => r.status < 500,
    'shared idemp returns 200 or 409': (r) => !useShared || r.status === 200 || r.status === 201 || r.status === 409,
  });

  sleep(0.2);
}

export function handleSummary(data) {
  const accepted = data.metrics.payment_accepted?.values?.count || 0;
  const dup = data.metrics.payment_duplicate_409?.values?.count || 0;
  const errors = data.metrics.payment_server_error?.values?.count || 0;
  // eslint-disable-next-line no-console
  console.log(`\n=== Invoice payment race ===\nAccepted: ${accepted}\nDuplicate 409: ${dup}\nServer errors: ${errors}\nNote: vérifier en DB paidAmount == accepted * 10 MAD`);
  return { stdout: JSON.stringify(data.metrics, null, 2) };
}
