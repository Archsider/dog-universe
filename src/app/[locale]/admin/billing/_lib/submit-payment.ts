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
//   - Body validated against the same Zod schema the server uses
//     (recordPaymentBodySchema in src/lib/api-schemas/record-payment.ts)
//   - Identical error shape across all three UIs
//
// The helper does NOT own UI state — it returns the result, the caller
// decides how to surface it (toast, inline error, etc.).

import { recordInvoicePayment } from '@/lib/api-client';
import type { PaymentMethod, RecordPaymentBody } from '@/lib/api-schemas/record-payment';

export type { PaymentMethod };

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

export async function submitPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const body: RecordPaymentBody = {
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate,
    notes: input.notes ?? null,
    sendClientSms: input.sendClientSms,
  };
  const result = await recordInvoicePayment(input.invoiceId, body);
  if (result.ok) {
    return { ok: true, status: result.status };
  }
  return {
    ok: false,
    status: result.status,
    error: result.error.code,
  };
}
