'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-direct-api-fetch');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-direct-api-fetch', rule, {
  valid: [
    // Canonical path — use the typed client.
    { code: 'await createWalkinInvoice(body);' },
    { code: 'await cancelInvoice(id, body);' },
    { code: 'await patchInvoice(id, body);' },

    // Fetch on routes NOT in the protected list (read-only or non-migrated).
    { code: "await fetch('/api/admin/walkin-clients', { method: 'POST' });" },
    { code: "await fetch('/api/admin/products', { method: 'GET' });" },
    { code: "await fetch(`/api/admin/bookings/${id}/checkout`, { method: 'POST' });" },
    { code: "await fetch(`/api/admin/bookings/${id}/messages`, { method: 'POST' });" },
    { code: "await fetch(`/api/admin/bookings/${id}/photos`, { method: 'POST' });" },
    { code: "await fetch(`/api/admin/bookings/${id}/items`, { method: 'POST' });" },
    { code: "await fetch(`/api/admin/bookings/${id}/detail`);" },
    { code: "await fetch(`/api/invoices/${id}/payments/${paymentId}`, { method: 'DELETE' });" },
    { code: "await fetch(`/api/invoices/${id}`, { method: 'DELETE' });" },
    { code: "await fetch(`/api/invoices/${id}`);" }, // GET — not in scope

    // Implementation files (api-client) are whitelisted.
    {
      filename: '/repo/src/lib/api-client/walkin-invoice.ts',
      code: "await fetch('/api/admin/walkin-invoice', { method: 'POST' });",
    },
    {
      filename: '/repo/src/lib/api-client/fetcher.ts',
      code: "await fetch(path, { method: 'POST' });",
    },

    // Dynamic URLs we can't statically analyze — let through.
    { code: "await fetch(url, { method: 'POST' });" },
    { code: "await fetch(getApiUrl(), { method: 'POST' });" },

    // Member.fetch is not the global fetch.
    { code: "await someClient.fetch('/api/admin/walkin-invoice');" },
    // Sibling routes that share a URL prefix but have their own handlers.
    { code: "await fetch('/api/admin/bookings/merge', { method: 'POST' });" },
    { code: "await fetch('/api/admin/bookings/today', { method: 'GET' });" },
  ],
  invalid: [
    // POST /api/admin/walkin-invoice
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch('/api/admin/walkin-invoice', { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/invoices/[id]/payments — template literal with ${id}
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch(`/api/invoices/${id}/payments`, { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/admin/invoices/[id]/cancel
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch(`/api/admin/invoices/${id}/cancel`, { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/admin/bookings/[id]/cancel
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch(`/api/admin/bookings/${id}/cancel`, { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/admin/bookings/[id]/time-proposals
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch(`/api/admin/bookings/${id}/time-proposals`, { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/admin/bookings (exact, no trailing path)
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch('/api/admin/bookings', { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // PATCH /api/admin/bookings/[id]
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch(`/api/admin/bookings/${id}`, { method: 'PATCH' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/bookings
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch('/api/bookings', { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // POST /api/invoices
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch('/api/invoices', { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
    // Trailing slash variations also caught (POST)
    {
      filename: '/repo/src/components/Foo.tsx',
      code: "await fetch('/api/admin/walkin-invoice/', { method: 'POST' });",
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('✓ no-direct-api-fetch: all cases pass');
