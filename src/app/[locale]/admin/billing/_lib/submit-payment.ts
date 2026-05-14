// Shared payment submission helper — the ONE legitimate path from the
// frontend to the backend for recording an invoice payment.
//
// History: before this module, three independent components reached for
// the backend in three different ways:
//
//   1. PaymentModal.tsx          → POST /api/invoices/[id]/payments ✓
//   2. CreateInvoiceButton.tsx   → PATCH /api/invoices/[id] with
//                                  { paidAmount, paymentMethod } — fields
//                                  the PATCH handler IGNORES, so the
//                                  button was a placebo for years on the
//                                  booking detail page.
//   3. use-invoice-detail.ts     → POST /api/invoices/[id]/payments
//                                  (correct endpoint, but no Idempotency-Key,
//                                  no sendClientSms flag, so the respectful
//                                  SMS policy (ADR-0008) was bypassed).
//
// One source of truth: every call site now goes through `submitPayment`.
// That guarantees:
//   - Idempotency-Key header (server rejects replays inside 24h, ADR-0003)
//   - sendClientSms flag honoured (ADR-0008 respectful SMS policy)
//   - Identical error shape across all three UIs
//
// The helper does NOT own UI state — it returns the result, the caller
// decides how to surface it (toast, inline error, etc.).

export type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD as written by the `<input type="date">`. */
  paymentDate: string;
  notes?: string | null;
  /** When `false`, the server skips the *client*-side SMS entirely. The
   *  admin SMS still fires unconditionally — the operator wants their own
   *  ledger notification regardless of what the client receives. */
  sendClientSms: boolean;
}

export type RecordPaymentResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

function randomIdempotencyKey(): string {
  // crypto.randomUUID is available in all evergreen browsers + Node 20+;
  // the fallback keeps older mobile WebViews from hard-failing on the
  // header serialization.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function submitPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  try {
    const res = await fetch(`/api/invoices/${input.invoiceId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': randomIdempotencyKey(),
      },
      body: JSON.stringify({
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        notes: input.notes ?? null,
        sendClientSms: input.sendClientSms,
      }),
    });
    if (res.ok) {
      return { ok: true, status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      status: res.status,
      error: data.error ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'NETWORK_ERROR',
    };
  }
}
