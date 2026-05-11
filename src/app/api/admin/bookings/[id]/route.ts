import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { withSchema } from '@/lib/with-schema';
import { revalidateTag } from 'next/cache';
import { BookingError } from '@/lib/services/booking-errors';
import { canTransition, isBookingStatus, type BookingStatus } from '@/lib/booking-state-machine';
import {
  adminBookingPatchSchema,
  adminBookingParamsSchema,
  patchBoardingDetail,
  addBookingItems,
  rejectExtensionRequest,
  approveExtensionMerge,
  rejectExtensionMerge,
  applyExtension,
  editDates,
  applyStatusUpdate,
  handleNoShowInvoice,
  runStatusSideEffects,
} from '@/lib/services/booking-admin';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/bookings/[id]
// ────────────────────────────────────────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(booking);
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/bookings/[id] — dispatcher
//
// Body validated against `adminBookingPatchSchema` (strict whitelist of
// discriminator field names). Each branch delegates to a service in
// `@/lib/services/booking-admin` — see that folder's README for the contract.
//
// `BookingError` thrown by a service is mapped here back to the HTTP shape so
// the on-the-wire response is unchanged from the pre-split implementation.
// ────────────────────────────────────────────────────────────────────────────
export const PATCH = withSchema(
  { body: adminBookingPatchSchema, params: adminBookingParamsSchema },
  async (_request, { body, params }) => {
    const { id } = params;
    const session = await auth();
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status, notes } = body as { status?: string; notes?: string };
    const forcePaidInvoice = Boolean(body.forcePaidInvoice);

    const booking = await prisma.booking.findFirst({
      where: { id: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      include: {
        client: true,
        bookingPets: { include: { pet: true } },
        boardingDetail: true,
        taxiDetail: true,
        invoice: true,
      },
    });
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Optimistic concurrency: when caller provides `version`, refuse to apply
    // the patch if the row was modified since they read it. Backward compatible
    // — callers that don't send `version` skip the check (legacy behavior).
    const expectedVersion = typeof body.version === 'number' ? body.version : null;
    if (expectedVersion !== null && expectedVersion !== booking.version) {
      return NextResponse.json(
        { error: 'VERSION_CONFLICT', message: 'This booking was modified by someone else. Please refresh.', currentVersion: booking.version },
        { status: 409 },
      );
    }

    // ── Status transition guards ──────────────────────────────────────────────
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const reason = typeof body.cancellationReason === 'string' ? body.cancellationReason.trim() : '';
      if (reason.length < 10) {
        return NextResponse.json(
          { error: 'CANCELLATION_REASON_REQUIRED', message: 'cancellationReason (min 10 chars) is required when rejecting or cancelling a booking' },
          { status: 400 },
        );
      }
    }

    if (status === 'NO_SHOW' && !['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'INVALID_TRANSITION', message: 'NO_SHOW only from CONFIRMED or IN_PROGRESS' },
        { status: 400 },
      );
    }
    if (
      status &&
      booking.status === 'WAITLIST' &&
      !['PENDING', 'CANCELLED', 'WAITLIST'].includes(status)
    ) {
      return NextResponse.json(
        { error: 'INVALID_TRANSITION', message: 'From WAITLIST only PENDING or CANCELLED' },
        { status: 400 },
      );
    }

    // ── Branch: patchBoardingDetail ───────────────────────────────────────────
    if (body.patchBoardingDetail !== undefined) {
      try {
        const result = await patchBoardingDetail({
          bookingId: id,
          patch: body.patchBoardingDetail as Record<string, unknown>,
          actorId: session.user.id,
        });
        return NextResponse.json(result);
      } catch (err) {
        return mapBookingError(err, {
          ONLY_BOARDING: () => NextResponse.json({ error: 'Only applies to BOARDING bookings' }, { status: 400 }),
          INVALID_FIELDS: (e) => NextResponse.json({ error: e.message }, { status: 400 }),
        });
      }
    }

    // ── Branch: addBookingItems ───────────────────────────────────────────────
    if (Array.isArray(body.addBookingItems) && body.addBookingItems.length > 0) {
      try {
        const result = await addBookingItems({
          bookingId: id,
          rawItems: body.addBookingItems as unknown[],
          actorId: session.user.id,
        });
        return NextResponse.json(result);
      } catch (err) {
        return mapBookingError(err);
      }
    }

    // ── Branch: approveExtension on a separate PENDING_EXTENSION booking ─────
    if (body.approveExtension && booking.status === 'PENDING_EXTENSION') {
      try {
        const result = await approveExtensionMerge({ bookingId: id, actorId: session.user.id });
        return NextResponse.json(result);
      } catch (err) {
        return mapBookingError(err);
      }
    }

    // ── Branch: rejectExtension on a separate PENDING_EXTENSION booking ──────
    if (body.rejectExtension && booking.status === 'PENDING_EXTENSION') {
      try {
        const result = await rejectExtensionMerge({ bookingId: id, actorId: session.user.id });
        return NextResponse.json(result);
      } catch (err) {
        return mapBookingError(err);
      }
    }

    // ── Branch: editDates ─────────────────────────────────────────────────────
    if (body.editDates) {
      const { startDate: newStartStr, endDate: newEndStr } = body.editDates as { startDate?: string; endDate?: string };
      if (!newStartStr || !newEndStr) {
        return NextResponse.json({ error: 'editDates requires startDate and endDate' }, { status: 400 });
      }
      try {
        const result = await editDates({
          booking,
          newStartStr,
          newEndStr,
          forcePaidInvoice,
          actorId: session.user.id,
        });
        return NextResponse.json(result);
      } catch (err) {
        // Preserve verbatim error messages for the legacy validation strings.
        if (err instanceof BookingError && err.code === 'INVALID_FIELDS') {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return mapBookingError(err);
      }
    }

    // ── Branch: extension (direct extend OR approve flag-based request) ──────
    const newEndDateStr: string | undefined = (body.extendEndDate as string | undefined)
      ?? (body.approveExtension ? booking.extensionRequestedEndDate?.toISOString().slice(0, 10) : undefined);

    if (newEndDateStr || body.rejectExtension) {
      if (booking.serviceType !== 'BOARDING') {
        return NextResponse.json({ error: 'Extensions only apply to boarding stays' }, { status: 400 });
      }

      // Reject the flag-based extension request (no separate booking).
      if (body.rejectExtension) {
        try {
          const result = await rejectExtensionRequest({
            bookingId: id,
            actorId: session.user.id,
          });
          return NextResponse.json(result);
        } catch (err) {
          return mapBookingError(err, {
            INVALID_TRANSITION: () => NextResponse.json({ error: 'No pending extension request' }, { status: 400 }),
            ONLY_BOARDING: () => NextResponse.json({ error: 'Extensions only apply to boarding stays' }, { status: 400 }),
          });
        }
      }

      // Apply the extension (direct or flag approval).
      try {
        const result = await applyExtension({
          booking,
          newEndDateStr: newEndDateStr!,
          forcePaidInvoice,
          actorId: session.user.id,
          isApproval: Boolean(body.approveExtension),
        });
        return NextResponse.json(result);
      } catch (err) {
        // Preserve the legacy human-readable validation messages.
        if (err instanceof BookingError && err.code === 'INVALID_FIELDS') {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return mapBookingError(err);
      }
    }
    // ── End extension handling ────────────────────────────────────────────────

    // ── Status / notes change ─────────────────────────────────────────────────
    const newStatus = status as string | undefined;
    // State-machine guard: refuse arbitrary jumps. AT_PICKUP is accepted by the
    // status enum but is not part of the canonical machine — let it through to
    // preserve existing taxi flows that key off it.
    if (newStatus && newStatus !== booking.status && newStatus !== 'AT_PICKUP') {
      if (!isBookingStatus(booking.status) || !isBookingStatus(newStatus)) {
        console.warn(JSON.stringify({
          level: 'warn',
          service: 'booking',
          message: 'state machine bypass: unknown status',
          from: booking.status,
          to: newStatus,
          bookingId: id,
        }));
      } else if (!canTransition(booking.status as BookingStatus, newStatus as BookingStatus)) {
        return NextResponse.json(
          { error: 'INVALID_TRANSITION', from: booking.status, to: newStatus },
          { status: 400 },
        );
      }
    }

    const cancellationReason = (status === 'REJECTED' || status === 'CANCELLED')
      ? (typeof body.cancellationReason === 'string' ? body.cancellationReason.trim() : undefined)
      : undefined;

    const updated = await applyStatusUpdate({
      bookingId: id,
      status,
      notes,
      cancellationReason,
    });

    // NO_SHOW: cancel invoice (if unpaid) + restock products. Idempotent.
    if (status === 'NO_SHOW' && status !== booking.status) {
      await handleNoShowInvoice({
        bookingId: id,
        actorId: session.user.id,
        previousStatus: booking.status,
      });
    }

    // Send notifications + log on status change.
    if (status && status !== booking.status) {
      await runStatusSideEffects({
        booking,
        newStatus: status,
        actorId: session.user.id,
      });
    }

    // Status transition may move the booking out of (or into) PENDING — bust
    // the admin-counts cache so the sidebar badge reflects the new state.
    revalidateTag('admin-counts');

    return NextResponse.json(updated);
  },
);

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/bookings/[id]
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: { invoice: { select: { id: true, status: true, invoiceNumber: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Refuse to delete a booking whose invoice has already been paid — this would
  // silently erase financial records. Cancel the booking instead.
  if (booking.invoice?.status === 'PAID') {
    return NextResponse.json(
      { error: 'BOOKING_HAS_PAID_INVOICE', invoiceNumber: booking.invoice.invoiceNumber },
      { status: 409 }
    );
  }

  await prisma.booking.update({ where: { id }, data: { deletedAt: new Date() } });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_DELETED',
    entityType: 'Booking',
    entityId: id,
    details: { status: booking.status, clientId: booking.clientId },
  });

  return NextResponse.json({ message: 'deleted' });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map a thrown `BookingError` (or other error) to a `NextResponse`. Caller can
 * provide per-code overrides for branches that historically returned a custom
 * shape (e.g. `{ error: <human message> }` vs the default `{ error: <code> }`).
 */
function mapBookingError(
  err: unknown,
  overrides: Partial<Record<string, (e: BookingError) => NextResponse>> = {},
): NextResponse {
  if (err instanceof BookingError) {
    const override = overrides[err.code];
    if (override) return override(err);
    return NextResponse.json(
      { error: err.code, ...(err.payload ?? {}) },
      { status: err.status },
    );
  }
  throw err;
}
