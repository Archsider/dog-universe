/**
 * Shared error type for booking service functions.
 *
 * Service functions in `booking-admin.service.ts` and `booking-client.service.ts`
 * are pure (no Next.js types). They throw `BookingError` with a stable `code`
 * that the route layer maps to an HTTP status code + JSON payload.
 *
 * Codes preserved verbatim from the routes' previous response shapes so the
 * HTTP contract is unchanged after the refactor.
 */
export type BookingErrorCode =
  | 'VERSION_CONFLICT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CAPACITY_EXCEEDED'
  | 'INVALID_TRANSITION'
  | 'INVALID_INPUT'
  | 'INVALID_ITEM'
  | 'INVALID_ITEM_DESCRIPTION'
  | 'INVALID_ITEM_QUANTITY'
  | 'INVALID_ITEM_PRICE'
  | 'INVALID_ITEM_CATEGORY'
  | 'SUNDAY_NOT_ALLOWED'
  | 'INVALID_TIME_SLOT'
  | 'DUPLICATE_REQUEST'
  | 'INVOICE_ALREADY_PAID'
  | 'INVALID_COMPUTED_TOTAL'
  | 'NO_ORIGINAL_BOOKING'
  | 'ORIGINAL_BOOKING_NOT_FOUND'
  | 'ONLY_BOARDING'
  | 'INVALID_FIELDS';

export interface BookingErrorOptions {
  status?: number;
  payload?: Record<string, unknown>;
  message?: string;
}

export class BookingError extends Error {
  public readonly code: BookingErrorCode;
  public readonly status: number;
  public readonly payload?: Record<string, unknown>;

  constructor(code: BookingErrorCode, opts: BookingErrorOptions = {}) {
    super(opts.message ?? code);
    this.name = 'BookingError';
    this.code = code;
    this.status = opts.status ?? defaultStatusForCode(code);
    this.payload = opts.payload;
  }
}

function defaultStatusForCode(code: BookingErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'VERSION_CONFLICT':
    case 'DUPLICATE_REQUEST':
    case 'INVOICE_ALREADY_PAID':
      return 409;
    default:
      return 400;
  }
}
