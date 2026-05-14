#!/usr/bin/env node
// Guards against the Next.js 15 "Route does not match required types"
// build error caused by exporting helpers from `route.ts` files.
//
// Next.js 15 only allows the following exports from a route file:
//
//   HTTP method handlers:
//     GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS
//
//   Route segment config:
//     dynamic, dynamicParams, revalidate, fetchCache, runtime,
//     preferredRegion, maxDuration, generateStaticParams, metadata,
//     generateMetadata
//
// Anything else (a helper function, a type used by other routes, a const)
// triggers a hard build failure on Vercel — but NOT on `next dev` or
// `tsc --noEmit`. So the bug stays latent until prod deploy.
//
// This script greps every route.ts under src/app/, parses out the export
// names, and exits 1 if any non-whitelisted name appears. CI runs it on
// every PR via .github/workflows/ci.yml.
//
// To export a helper "shared" by multiple routes: put it in a sibling
// file under a folder prefixed with `_` (Next.js treats `_` folders as
// private — they don't generate routes). Example:
//
//   src/app/api/admin/products/_lib/serialize.ts   ← helper lives here
//   src/app/api/admin/products/route.ts            ← imports from _lib

import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';

const ALLOWED = new Set([
  // HTTP method handlers
  'GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS',
  // Route segment config
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime',
  'preferredRegion', 'maxDuration', 'generateStaticParams', 'metadata',
  'generateMetadata',
]);

// Match top-of-line `export <const|let|var|function|async function> NAME`
// or `export { A, B, C } from '...'` (re-exports).
//
// We intentionally don't try to handle every TypeScript export form —
// `export type` / `export interface` / `export default` are flagged
// separately because they're rarely correct in a route file.
const NAMED_EXPORT_RE = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
const REEXPORT_RE = /^export\s*\{([^}]+)\}/gm;
const TYPE_EXPORT_RE = /^export\s+(type|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
const DEFAULT_EXPORT_RE = /^export\s+default\b/m;

function findRouteFiles() {
  return glob('src/app/**/route.ts');
}

function extractExports(src) {
  const names = new Set();
  let m;

  // 1. `export const NAME` / `export function NAME` / etc.
  NAMED_EXPORT_RE.lastIndex = 0;
  while ((m = NAMED_EXPORT_RE.exec(src)) !== null) {
    names.add(m[1]);
  }

  // 2. `export { A, B as C } from '...'`  (re-export — also covers
  //    `export const { GET, POST } = handlers` after a transform pass).
  REEXPORT_RE.lastIndex = 0;
  while ((m = REEXPORT_RE.exec(src)) !== null) {
    const inside = m[1];
    for (const part of inside.split(',')) {
      // Handle "A as B" — the exported name is B
      const exported = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (exported) names.add(exported);
    }
  }

  // 3. `export const { GET, POST } = handlers` — destructured exports
  //    used by next-auth's catch-all route.
  const destructureMatches = src.matchAll(/^export\s+(?:const|let|var)\s*\{([^}]+)\}/gm);
  for (const dm of destructureMatches) {
    for (const part of dm[1].split(',')) {
      const name = part.trim().split(':')[0].trim();
      if (name) names.add(name);
    }
  }

  // 4. `export type` / `export interface` — count separately, treat as
  //    a violation regardless (Next.js doesn't permit either).
  const typeNames = [];
  TYPE_EXPORT_RE.lastIndex = 0;
  while ((m = TYPE_EXPORT_RE.exec(src)) !== null) {
    typeNames.push(`${m[1]} ${m[2]}`);
  }

  // 5. `export default` — same story.
  const hasDefault = DEFAULT_EXPORT_RE.test(src);

  return { names: [...names], typeExports: typeNames, hasDefault };
}

async function main() {
  const violations = [];

  for await (const file of findRouteFiles()) {
    const src = readFileSync(file, 'utf-8');
    const { names, typeExports, hasDefault } = extractExports(src);

    const badNames = names.filter((n) => !ALLOWED.has(n));
    if (badNames.length > 0) {
      violations.push({ file, kind: 'name', detail: badNames });
    }
    if (typeExports.length > 0) {
      violations.push({ file, kind: 'type', detail: typeExports });
    }
    if (hasDefault) {
      violations.push({ file, kind: 'default', detail: ['default'] });
    }
  }

  if (violations.length === 0) {
    console.log('✅ All route.ts exports are valid Next.js handlers.');
    return;
  }

  console.error('❌ Forbidden exports in route.ts files:\n');
  for (const v of violations) {
    console.error(`  ${v.file}`);
    for (const d of v.detail) {
      console.error(`    └─ ${d}`);
    }
  }
  console.error('');
  console.error('Move helpers to a sibling file under a folder prefixed with `_`');
  console.error('(eg. `_lib/serialize.ts`). Next.js treats `_` folders as private');
  console.error('and they do not generate routes.');
  console.error('');
  console.error('Allowed exports from a route.ts file:');
  console.error(`  HTTP handlers: GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS`);
  console.error(`  Route config:  dynamic, runtime, maxDuration, revalidate,`);
  console.error(`                 fetchCache, preferredRegion, dynamicParams,`);
  console.error(`                 generateStaticParams, metadata, generateMetadata`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Route export check crashed:', err);
  process.exit(1);
});
