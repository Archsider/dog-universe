/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/**
 * Tests régression — Bug 4 (PR hard-bugs-may17)
 *
 * CSV export must stream cursor-based: bounded memory regardless of
 * invoice count. Pre-fix it loaded up to 10k invoices into one heap
 * (with full relations) — OOM at 10x scale.
 *
 * Strategy:
 *   - Mock prisma.invoice.findMany to simulate keyset pagination over
 *     a large fixture (2000 rows). Verify it's called in batches and
 *     stops at the safety cap.
 *   - Verify the streamed CSV body contains the right number of lines
 *     and headers, and that escapeCsv is applied (formula injection).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../../auth', () => ({ auth: () => authMock() }));

const findManyMock: any = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { invoice: { findMany: (args: any) => findManyMock(args) } },
}));

vi.mock('@/lib/billing', () => ({
  getMonthlyInvoicesWhere: () => ({}),
}));

beforeEach(() => {
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
  findManyMock.mockReset();
});

function makeInvoice(i: number) {
  return {
    id: `inv${String(i).padStart(6, '0')}`,
    invoiceNumber: `DU-2026-${String(i).padStart(4, '0')}`,
    amount: 500,
    paidAmount: 500,
    issuedAt: new Date('2026-05-15T08:00:00Z'),
    paidAt: new Date('2026-05-15T08:00:00Z'),
    status: 'PAID',
    client: { name: `Client ${i}`, email: `c${i}@example.com`, phone: '+212600000000' },
    booking: { serviceType: 'BOARDING' },
    payments: [{ paymentDate: new Date('2026-05-15T08:00:00Z'), paymentMethod: 'CASH' }],
    items: [{ category: 'BOARDING', total: 500 }],
  };
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  // ignoreBOM=true so the U+FEFF prefix shows up as a real char in the
  // decoded string (default TextDecoder behaviour strips a leading BOM).
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

describe('GET /api/admin/invoices/export — streaming', () => {
  it('rejects non-admin (403)', async () => {
    authMock.mockReturnValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const mod = await import('../route');
    const res = await mod.GET(new Request('http://test/'));
    expect(res.status).toBe(403);
  });

  it('streams 2000 invoices via keyset cursor without OOM (batches of 500)', async () => {
    const TOTAL = 2000;
    const BATCH = 500;
    const all = Array.from({ length: TOTAL }, (_, i) => makeInvoice(i));

    // Simulate keyset pagination. The route uses `orderBy: id ASC`
    // + `cursor: { id }` + `skip: 1` after the first call.
    findManyMock.mockImplementation(async (args: any) => {
      const take = args.take ?? BATCH;
      let startIdx = 0;
      if (args.cursor?.id) {
        startIdx = all.findIndex(r => r.id === args.cursor.id) + 1;
      }
      return all.slice(startIdx, startIdx + take);
    });

    const mod = await import('../route');
    const res = await mod.GET(new Request('http://test/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const csv = await streamToString(res.body!);
    // Header + 2000 data rows + final \r\n on the last batch = 2001 \r\n separators ; split returns 2002 segments
    const lines = csv.split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(TOTAL + 1); // +1 for header

    // Verify pagination — 5 calls (4 batches of 500 + 1 empty terminating call OR exact-fit early-exit).
    // The route breaks out of the loop when `batch.length < take`, so for an
    // exact multiple of BATCH it makes one extra call to confirm there's
    // nothing left. We accept 4 or 5 calls — what matters is that it never
    // loaded 2000 in one shot.
    const callCount = findManyMock.mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(4);
    expect(callCount).toBeLessThanOrEqual(5);
    // No single call should have take > BATCH_SIZE (=500).
    for (const call of findManyMock.mock.calls) {
      expect(call[0].take).toBeLessThanOrEqual(BATCH);
    }
  });

  it('applies CSV formula injection guard via escapeCsv on client name', async () => {
    findManyMock.mockResolvedValueOnce([{
      ...makeInvoice(0),
      client: { name: '=HYPERLINK("https://evil")', email: 'a@b.c', phone: null },
    }]);
    findManyMock.mockResolvedValueOnce([]);

    const mod = await import('../route');
    const res = await mod.GET(new Request('http://test/'));
    const csv = await streamToString(res.body!);

    // Formula-leading cell must be prefixed with '
    expect(csv).toContain("'=HYPERLINK");
  });

  it('writes UTF-8 BOM prefix for Excel compatibility', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const mod = await import('../route');
    const res = await mod.GET(new Request('http://test/'));
    const csv = await streamToString(res.body!);
    // BOM = U+FEFF as 3 bytes in UTF-8 ; in the decoded string it's just U+FEFF.
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('header row appears first and contains 13 columns', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const mod = await import('../route');
    const res = await mod.GET(new Request('http://test/'));
    const csv = await streamToString(res.body!);
    // Strip BOM, take first \r\n-separated line.
    const firstLine = csv.replace(/^﻿/, '').split('\r\n')[0];
    expect(firstLine.split(';')).toHaveLength(13);
  });
});
