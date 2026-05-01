// Typed Zod wrapper for Next.js 15 App Router route handlers.
//
// Usage:
//   export const POST = withSchema(
//     { body: mySchema, params: z.object({ id: z.string() }) },
//     async (request, { body, params }) => {
//       // body and params are inferred and parsed
//       return NextResponse.json({ ok: true });
//     },
//   );
//
// Behaviour:
// - Parses + awaits routeCtx.params (Next 15 async params), then validates with
//   `schemas.params` if provided.
// - When `schemas.body` is provided, reads request.json(); on parse error,
//   returns 400 INVALID_JSON. On Zod failure on either body or params, returns
//   400 VALIDATION_ERROR.
// - Validation error responses include a `details` field (Zod issues) only when
//   NODE_ENV !== 'production' to avoid leaking internal structure in prod.
// - Auth/session is intentionally NOT wired here — keep the handler in charge
//   of `auth()` so this wrapper stays a pure validation layer.

import { NextResponse } from 'next/server';
import { z } from 'zod';

type AnyZod = z.ZodTypeAny;

type Schemas<BS extends AnyZod | undefined, PS extends AnyZod | undefined> = {
  body?: BS;
  params?: PS;
};

type Out<S extends AnyZod | undefined> = S extends AnyZod ? z.output<S> : undefined;
type OutP<S extends AnyZod | undefined> = S extends AnyZod ? z.output<S> : Record<string, never>;

type Handler<BS extends AnyZod | undefined, PS extends AnyZod | undefined> = (
  request: Request,
  ctx: { body: Out<BS>; params: OutP<PS> },
) => Promise<Response> | Response;

type RouteCtx<PS extends AnyZod | undefined> = { params: Promise<OutP<PS>> };

function validationError(issues: z.ZodIssue[]): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';
  const payload: Record<string, unknown> = { error: 'VALIDATION_ERROR' };
  if (!isProd) {
    payload.details = issues;
  }
  return NextResponse.json(payload, { status: 400 });
}

export function withSchema<
  BS extends AnyZod | undefined = undefined,
  PS extends AnyZod | undefined = undefined,
>(
  schemas: Schemas<BS, PS>,
  handler: Handler<BS, PS>,
): (request: Request, routeCtx: RouteCtx<PS>) => Promise<Response> {
  return async (request: Request, routeCtx: RouteCtx<PS>): Promise<Response> => {
    // 1) Resolve and validate params
    const rawParams = await routeCtx.params;
    let params = rawParams as OutP<PS>;
    if (schemas.params) {
      const result = schemas.params.safeParse(rawParams);
      if (!result.success) {
        return validationError(result.error.issues);
      }
      params = result.data as OutP<PS>;
    }

    // 2) Parse and validate body when a body schema is declared
    let body = undefined as Out<BS>;
    if (schemas.body) {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
      }
      const result = schemas.body.safeParse(raw);
      if (!result.success) {
        return validationError(result.error.issues);
      }
      body = result.data as Out<BS>;
    }

    return handler(request, { body, params });
  };
}
