// Typed fetch wrapper for internal API routes.
//
// The whole point of this module is to make the boundary between
// browser code and route handlers type-safe in BOTH directions :
//   - body is validated against the same Zod schema the server uses
//     (catch malformed requests before they cross the network)
//   - response is parsed into a discriminated `ApiResult<TSuccess, TError>`
//     that forces consumers to handle the error case at compile time
//
// Usage :
//   const result = await apiPost(
//     '/api/admin/walkin-invoice',
//     walkinInvoiceBodySchema,
//     body,
//     { headers: { 'Idempotency-Key': key } },
//   );
//   if (!result.ok) {
//     showToast(result.error.code);
//     return;
//   }
//   router.push(`/admin/invoices/${result.data.invoiceId}`);

import type { ZodTypeAny, ZodIssue } from 'zod';

/**
 * Discriminated result. Callers MUST narrow on `result.ok` before
 * touching `data` / `error`.
 */
export type ApiResult<TSuccess, TErrorCode extends string = string> =
  | { ok: true; data: TSuccess; status: number }
  | { ok: false; error: ApiError<TErrorCode>; status: number };

export interface ApiError<TCode extends string = string> {
  /** Server-emitted error code (e.g. `INVALID_BODY`, `FORBIDDEN`). */
  code: TCode | 'NETWORK_ERROR' | 'CLIENT_VALIDATION_FAILED' | 'UNKNOWN_ERROR';
  /** Human-readable message when available (typically dev/debug only). */
  message?: string;
  /** Zod issues — present when the **client** pre-flight validation fails,
   *  OR when the server returns a `INVALID_BODY` response with `issues`. */
  issues?: ZodIssue[];
  /** Free-form server payload (e.g. OVERPAYMENT exposes balance details). */
  detail?: unknown;
}

interface ApiPostOptions {
  /** Additional request headers (e.g. Idempotency-Key). */
  headers?: Record<string, string>;
  /** Override the default `Content-Type: application/json`. */
  contentType?: string;
  /** Abort controller for cancellation. */
  signal?: AbortSignal;
}

/**
 * Typed POST. The Zod schema acts as the **single source of truth** —
 * both for client-side pre-validation (here) and server-side parsing
 * (in the route handler). Mismatch would fail at compile time as soon
 * as either side imports from the schema module.
 */
export async function apiPost<
  TSchema extends ZodTypeAny,
  TSuccess,
  TErrorCode extends string = string,
>(
  path: string,
  schema: TSchema,
  body: unknown,
  options: ApiPostOptions = {},
): Promise<ApiResult<TSuccess, TErrorCode>> {
  return apiRequest('POST', path, schema, body, options);
}

/** Same as `apiPost` but issues a PATCH. */
export async function apiPatch<
  TSchema extends ZodTypeAny,
  TSuccess,
  TErrorCode extends string = string,
>(
  path: string,
  schema: TSchema,
  body: unknown,
  options: ApiPostOptions = {},
): Promise<ApiResult<TSuccess, TErrorCode>> {
  return apiRequest('PATCH', path, schema, body, options);
}

async function apiRequest<
  TSchema extends ZodTypeAny,
  TSuccess,
  TErrorCode extends string = string,
>(
  method: 'POST' | 'PATCH',
  path: string,
  schema: TSchema,
  body: unknown,
  options: ApiPostOptions = {},
): Promise<ApiResult<TSuccess, TErrorCode>> {
  // Client-side validation. We use safeParse so a single misshapen field
  // surfaces with the full Zod issue list — identical to what the server
  // returns for `INVALID_BODY`.
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 0,
      error: {
        code: 'CLIENT_VALIDATION_FAILED',
        issues: parsed.error.issues,
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': options.contentType ?? 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(parsed.data),
      signal: options.signal,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'fetch failed',
      },
    };
  }

  // Try to parse JSON regardless of status — error payloads carry codes.
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Empty / non-JSON response. Treat as error if status ≥ 400.
    if (response.status >= 400) {
      return {
        ok: false,
        status: response.status,
        error: { code: 'UNKNOWN_ERROR', message: `HTTP ${response.status}` },
      };
    }
    return {
      ok: true,
      status: response.status,
      data: undefined as unknown as TSuccess,
    };
  }

  if (response.ok) {
    // Some routes return `{ ok: true, ... }` ; others return the raw resource.
    // Either shape passes through unchanged — caller knows its TSuccess type.
    return {
      ok: true,
      status: response.status,
      data: payload as TSuccess,
    };
  }

  // Error branch — extract `error` (legacy) or `error.code` (newer routes).
  const obj = (payload ?? {}) as Record<string, unknown>;
  const code = typeof obj.error === 'string' ? (obj.error as TErrorCode) : 'UNKNOWN_ERROR';
  const issues = Array.isArray(obj.issues) ? (obj.issues as ZodIssue[]) : undefined;
  return {
    ok: false,
    status: response.status,
    error: {
      code: code as TErrorCode,
      message: typeof obj.message === 'string' ? obj.message : undefined,
      issues,
      detail: obj.detail ?? obj,
    },
  };
}
