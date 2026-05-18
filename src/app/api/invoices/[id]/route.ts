import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { isPaidExceedsCheckViolation, PAID_EXCEEDS_PAYLOAD } from '@/lib/billing-errors';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { cacheDel } from '@/lib/cache';
import { casablancaYMD } from '@/lib/dates-casablanca';
import { withSpan } from '@/lib/observability';

type Params = { params: Promise<{ id: string }> };

const FULL_INCLUDE = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  booking: {
    include: {
      bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
      boardingDetail: true,
      taxiDetail: true,
    },
  },
  items: { orderBy: { id: 'asc' } as const },
  payments: { orderBy: { paymentDate: 'asc' } as const },
};

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, role: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
          boardingDetail: true,
          taxiDetail: true,
        },
      },
      items: true,
      payments: { orderBy: { paymentDate: 'asc' } },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'CLIENT' && invoice.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Authz cross-role : ADMIN ne peut lire que les factures de clients (CLIENT). SUPERADMIN passe partout.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  return NextResponse.json(invoice);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withSpan('api.invoices.patch', { entityId: id }, () => patchImpl(request, id));
}

async function patchImpl(request: Request, id: string): Promise<Response> {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await request.json();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Authz cross-role : ADMIN ne peut toucher que les factures de clients (CLIENT).
  // SUPERADMIN passe partout. Empêche un ADMIN d'éditer la facture d'un autre admin.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Optimistic concurrency: when caller provides `version`, refuse to apply
  // the patch if the row was modified since they read it. Backward compatible
  // — callers that don't send `version` skip the check (legacy behavior).
  const expectedVersion = typeof body.version === 'number' ? body.version : null;
  if (expectedVersion !== null && expectedVersion !== invoice.version) {
    return NextResponse.json(
      { error: 'VERSION_CONFLICT', message: 'This invoice was modified by someone else. Please refresh.', currentVersion: invoice.version },
      { status: 409 },
    );
  }

  // ── Full edit (items array provided) ──────────────────────────────────────
  if (Array.isArray(body.items)) {
    const { items, issuedAt, notes, status, clientDisplayName, clientDisplayPhone, clientDisplayEmail } = body;

    const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

    // Validate items
    if (items.length === 0) {
      return NextResponse.json({ error: 'INVALID_ITEMS' }, { status: 400 });
    }
    // DISCOUNT included — without it, editing a walk-in invoice that
    // contains a discount line (created via POST /api/admin/walkin-invoice)
    // would fail validation on re-upload of the same items. Sign rules
    // mirror /api/admin/walkin-invoice : DISCOUNT ⇒ unitPrice < 0 ;
    // everything else ⇒ unitPrice >= 0.
    const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER', 'DISCOUNT'] as const;
    for (const item of items as { description: unknown; quantity: unknown; unitPrice: unknown; category?: unknown; productId?: unknown }[]) {
      if (typeof item.description !== 'string' || !item.description.trim()) {
        return NextResponse.json({ error: 'INVALID_ITEM_DESCRIPTION' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        return NextResponse.json({ error: 'INVALID_ITEM_QUANTITY' }, { status: 400 });
      }
      if (typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice)) {
        return NextResponse.json({ error: 'INVALID_ITEM_PRICE' }, { status: 400 });
      }
      if (item.category !== undefined && (typeof item.category !== 'string' || !VALID_CATEGORIES.includes(item.category as typeof VALID_CATEGORIES[number]))) {
        return NextResponse.json({ error: 'INVALID_ITEM_CATEGORY' }, { status: 400 });
      }
      // Sign refinement : DISCOUNT lines MUST be negative ; all other
      // categories MUST be >= 0. Symmetric to walkin-invoice/route.ts.
      const isDiscount = item.category === 'DISCOUNT';
      if (isDiscount && (item.unitPrice as number) >= 0) {
        return NextResponse.json({ error: 'DISCOUNT_REQUIRES_NEGATIVE_PRICE' }, { status: 400 });
      }
      if (!isDiscount && (item.unitPrice as number) < 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_PRICE' }, { status: 400 });
      }
      // Defense-in-depth refine : category='PRODUCT' MUST carry a non-empty
      // productId. Twin of the Zod refine in /api/admin/walkin-invoice +
      // the DB CHECK constraint InvoiceItem_product_category_has_productId.
      if (item.category === 'PRODUCT' && (typeof item.productId !== 'string' || item.productId.length === 0)) {
        return NextResponse.json({ error: 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID' }, { status: 400 });
      }
    }

    type ItemCategory = typeof VALID_CATEGORIES[number];
    interface ValidItem { description: string; quantity: number; unitPrice: number; category?: ItemCategory; productId?: string | null }
    const validItems = items as ValidItem[];
    const newAmount = validItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    if (newAmount <= 0) return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });

    // Validate status
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    // Validate clientDisplayName if provided
    if (clientDisplayName !== undefined && (typeof clientDisplayName !== 'string' || !clientDisplayName.trim())) {
      return NextResponse.json({ error: 'INVALID_CLIENT_NAME' }, { status: 400 });
    }

    // Validate issuedAt
    let resolvedIssuedAt: Date | undefined;
    if (issuedAt) {
      const d = new Date(issuedAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'INVALID_ISSUED_AT' }, { status: 400 });
      resolvedIssuedAt = d;
    }

    const isCancel = status === 'CANCELLED';

    try {
      await prisma.$transaction(async (tx) => {
      // 1. Replace items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: validItems.map(it => ({
          invoiceId: id,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.quantity * it.unitPrice,
          category: (it.category ?? 'OTHER') as ItemCategory,
          // Defense-in-depth : PRODUCT requires productId (Zod refine
          // PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID + DB CHECK).
          productId: it.productId ?? null,
        })),
      });

      // 2. Update invoice metadata
      //    status: CANCELLED → set it; otherwise PENDING (allocatePayments derives real status)
      //    paidAt: null → allocatePayments will set it on first PAID transition
      //    clientDisplayName/clientDisplayPhone/clientDisplayEmail: billing snapshot independent of User
      // Note: le trigger PG `trg_recompute_invoice_amount` recompute déjà
      // Invoice.amount = SUM(items.total) après les mutations sur InvoiceItem.
      // NE PAS écrire `amount` manuellement (drift garanti).
      // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: full invoice edit (admin PATCH /api/invoices/[id]) — items regenerated above, status flipped to CANCELLED or reset to PENDING + paidAt cleared. This is the canonical "edit invoice" path that owns its own status mutations. TODO Module 5+ : extract `editInvoice()` service into src/lib/billing/.
      await tx.invoice.update({
        where: { id },
        data: {
          version: { increment: 1 },
          ...(resolvedIssuedAt && { issuedAt: resolvedIssuedAt }),
          notes: typeof notes === 'string' ? notes.trim() || null : invoice.notes,
          status: isCancel ? 'CANCELLED' : 'PENDING',
          paidAt: null,
          ...(typeof clientDisplayName === 'string' && clientDisplayName.trim() && {
            clientDisplayName: clientDisplayName.trim().slice(0, 100),
          }),
          clientDisplayPhone: typeof clientDisplayPhone === 'string' && clientDisplayPhone.trim()
            ? clientDisplayPhone.trim().slice(0, 30)
            : null,
          clientDisplayEmail: typeof clientDisplayEmail === 'string' && clientDisplayEmail.trim()
            ? clientDisplayEmail.trim().slice(0, 254)
            : null,
        },
      });
      });

      // Recompute allocation (skipped if CANCELLED — allocatePayments ignores CANCELLED)
      if (!isCancel) {
        await allocatePayments(id);
      }
    } catch (err) {
      // H10 — Postgres CHECK violation (paidAmount would exceed new amount).
      if (isPaidExceedsCheckViolation(err)) {
        return NextResponse.json(PAID_EXCEEDS_PAYLOAD, { status: 409 });
      }
      throw err;
    }

    // P0-4: audit log on full invoice edit
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_UPDATED,
      entityType: 'Invoice',
      entityId: id,
      details: { fromStatus: invoice.status, toStatus: isCancel ? 'CANCELLED' : status ?? invoice.status, amount: newAmount },
    });

    const updated = await prisma.invoice.findUnique({ where: { id }, include: FULL_INCLUDE });
    return NextResponse.json(updated);
  }

  // ── Legacy: notes-only update ────────────────────────────────────────────
  // Previously this branch also accepted `body.status === 'CANCELLED'` and
  // flipped the invoice to CANCELLED inline — without the cascade unlink
  // of BookingItem.invoiceItemId, without the refund handling for paid
  // invoices, without the audit note append. Audit finding #8.
  //
  // All CANCELLED transitions now MUST go through POST /api/admin/invoices/
  // [id]/cancel which uses the canonical `cancelInvoice()` helper. Callers
  // that hit this legacy path with status=CANCELLED get a clear 400 with
  // a pointer to the right endpoint.
  if (body.status === 'CANCELLED') {
    return NextResponse.json(
      {
        error: 'USE_CANCEL_ENDPOINT',
        detail: {
          hint: 'POST /api/admin/invoices/[id]/cancel with { reason, refundExisting?, paymentMethodForRefund? }',
          reason: 'Legacy PATCH status=CANCELLED is no longer accepted — the dedicated cancel endpoint owns the full lifecycle (cascade unlink + refund + audit note).',
        },
      },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (body.notes !== undefined) {
    updateData.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  updateData.version = { increment: 1 };
  // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: notes-only path. Status/amount/paidAmount/paidAt are NOT in the update payload (the CANCELLED path above is rejected); only `notes` is set. Version bumped so concurrent edits surface a 409 via optimistic lock.
  const updated = await prisma.invoice.update({ where: { id }, data: updateData });

  // Audit log on the notes update (kept for parity with the previous flow).
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: id,
    details: { fromStatus: invoice.status, toStatus: invoice.status, notesUpdated: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  return withSpan('api.invoices.delete', { entityId: id }, () => deleteImpl(id));
}

async function deleteImpl(id: string): Promise<Response> {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // ── Sémantique B / cancel-invoice path enforcement ────────────────────
  // Hard DELETE is allowed ONLY for fully-clean PENDING invoices with no
  // payments. Any invoice that has received money MUST go through the
  // canonical cancel path (POST /api/admin/invoices/[id]/cancel) which
  // owns the BookingItem unlink, refund opt-in, audit trail and notif —
  // hard delete would lose all of that and silently drop revenue from
  // the MV without invalidating downstream caches consistently.
  const paidAmountNum = Number(invoice.paidAmount);
  if (paidAmountNum > 0) {
    return NextResponse.json(
      {
        error: 'INVOICE_HAS_PAYMENTS',
        message: 'This invoice has received payments. Use POST /api/admin/invoices/[id]/cancel instead of DELETE.',
        cancelEndpoint: `/api/admin/invoices/${id}/cancel`,
        paidAmount: paidAmountNum,
      },
      { status: 409 },
    );
  }
  if (invoice.status !== 'PENDING') {
    return NextResponse.json(
      {
        error: 'INVOICE_NOT_DELETABLE',
        message: `Only PENDING invoices with paidAmount=0 can be hard-deleted. Status=${invoice.status}. Use POST /api/admin/invoices/[id]/cancel for cancellation.`,
        cancelEndpoint: `/api/admin/invoices/${id}/cancel`,
      },
      { status: 409 },
    );
  }

  // onDelete: Cascade on InvoiceItem and Payment handles related records
  await prisma.invoice.delete({ where: { id } });

  // ── Sémantique B cache invalidation (fail-open) ─────────────────────────
  // Even on a paidAmount=0 PENDING invoice, the MV / revenue cache might
  // have observed it via the previous tick. Stamp the Casa-month key for
  // the periodDate (preferred — billing month source of truth) and fall
  // back to issuedAt for legacy invoices without periodDate.
  const monthAnchor = invoice.periodDate ?? invoice.issuedAt;
  const { year, month } = casablancaYMD(monthAnchor);
  await cacheDel(`revenue:${year}:${month}`);

  // P0-4: audit log on invoice deletion
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_DELETED,
    entityType: 'Invoice',
    entityId: id,
    details: { status: invoice.status, amount: invoice.amount, clientId: invoice.clientId },
  });

  return new NextResponse(null, { status: 204 });
}
