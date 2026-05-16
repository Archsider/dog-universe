/**
 * cached-auth — `auth()` memoised per request via React's `cache()`.
 *
 * Background: `auth()` decrypts the next-auth JWT (and, in our credentials
 * flow, can hit the DB to check `tokenVersion`/`role`). On a single RSC
 * render pass it's typically invoked several times — once in the layout,
 * once per nested layout, and once in the page. With `react.cache`, all
 * calls within the same render share the first resolved value, removing
 * those duplicate decrypt/DB calls.
 *
 * Behaviour:
 *  - Same RSC render → one underlying `auth()` invocation (deduped).
 *  - Across requests → no sharing (cache is per-request by React design).
 *  - Mutations and middleware are unaffected; they still call `auth()`
 *    directly.
 *
 * Usage:
 *   import { getCachedAuth } from '@/lib/cached-auth';
 *   const session = await getCachedAuth();
 *
 * Part of the May 17 10x-scale-prep PR.
 */
import { cache } from 'react';
import { auth } from '../../auth';

export const getCachedAuth = cache(async () => auth());
