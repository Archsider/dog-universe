# API Schemas (single source of truth)

Zod schemas + response types shared between route handlers (server) and
typed fetchers (client). Zero server-side deps allowed here — only Zod
+ plain TypeScript — so this module is safe to import from any
`'use client'` Component.

## Convention

For each route :

```ts
// src/lib/api-schemas/<route-name>.ts

import { z } from 'zod';

// 1. Request body schema (used by route .parse() AND client validation)
export const fooBodySchema = z.object({ ... }).strict();
export type FooBody = z.infer<typeof fooBodySchema>;

// 2. Success response (manually declared — describes the route's JSON shape)
export interface FooSuccess {
  ok: true;
  fooId: string;
}

// 3. Error code union (mirrors every return-with-error in the route)
export type FooErrorCode =
  | 'INVALID_BODY'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT';
```

The route handler imports the request schema for `.parse()`. The
typed client (in `src/lib/api-client/`) imports the schema for
pre-flight validation + the types for response handling.

## Rules

- **Zod schemas exported** so both sides can `.parse()` / `.safeParse()`
  if needed.
- **Error codes are tight unions** — adding a new branch in the route
  handler MUST add the corresponding code here, surfaced as a compile
  error in every consumer.
- **No Prisma imports**, no `next/server`, no env access. If you need
  a Prisma enum, copy the relevant `as const` array (the lint already
  complains about cross-runtime imports from this directory).
- The body schema is the **only** source of truth — never duplicate it
  in the route handler. If you need a slightly different shape for an
  internal use case, derive it with `schema.pick()` / `schema.omit()`.
