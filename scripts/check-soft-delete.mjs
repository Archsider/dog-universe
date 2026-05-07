#!/usr/bin/env node
// Tier 2 hardening (2026-05-09) — soft-delete CI guard.
//
// Greps src/app/api/ for prisma.{user,pet,booking}.find* calls that DON'T
// include `deletedAt` in their where clause. Each violation either:
//   - Fixes its where clause to include { deletedAt: null }
//   - Adds a // soft-delete-bypass: <reason> comment on the line above
//
// The script exits non-zero with a list of offending files when violations
// are found, so the GitHub Action can mark the PR as failed.
//
// Modes:
//   default  — strict: any violation fails the run.
//   --warn   — report-only: prints violations to stderr, exits 0. Use this
//              while migrating an existing codebase; flip to strict once the
//              backlog is annotated.
//
// Heuristic (deliberately conservative):
//   - Match the model.findX( opening, then capture chars until a balanced
//     closing paren (depth-tracked).
//   - If the captured arg block contains `deletedAt`, OR the previous line
//     contains `soft-delete-bypass`, the call is OK.
//   - We accept `prisma.X.find*`, `tx.X.find*`, and `<anything>.X.find*`
//     because services pass tx contexts in.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const TARGETS = ['src/app/api', 'src/lib/services'];
const MODELS = ['user', 'pet', 'booking'];
const FIND_PATTERN = new RegExp(
  String.raw`\b(?:prisma|tx|client|db)\.(${MODELS.join('|')})\.(findFirst|findUnique|findMany|findFirstOrThrow|findUniqueOrThrow)\s*\(`,
  'g',
);

/** Recursively walk a directory, returning all .ts/.tsx file paths. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Find the matching ')' for an opening '(' at index `open`. */
function balancedExtract(src, open) {
  let depth = 1;
  for (let i = open + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1); // unbalanced — return rest
}

/** Get the line preceding the byte offset `offset`. */
function previousLine(src, offset) {
  // Walk back to start of current line, then to start of prior line.
  let lineStart = src.lastIndexOf('\n', offset - 1);
  if (lineStart < 0) return '';
  const priorEnd = lineStart;
  const priorStart = src.lastIndexOf('\n', priorEnd - 1);
  return src.slice(priorStart + 1, priorEnd);
}

function lineNumber(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

const violations = [];
const files = TARGETS.flatMap((t) => walk(join(ROOT, t)));

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const match of src.matchAll(FIND_PATTERN)) {
    const matchOffset = match.index;
    const openParenOffset = matchOffset + match[0].length - 1;
    const args = balancedExtract(src, openParenOffset);

    if (args.includes('deletedAt')) continue;
    if (previousLine(src, matchOffset).includes('soft-delete-bypass')) continue;

    violations.push({
      file: relative(ROOT, file),
      line: lineNumber(src, matchOffset),
      snippet: match[0].replace(/\s+/g, ''),
    });
  }
}

const warnOnly = process.argv.includes('--warn');

if (violations.length > 0) {
  console.error('\nSoft-delete guard: found prisma find* calls without `deletedAt` filter.\n');
  console.error('Add `deletedAt: null` to the where clause, or add a comment on the line above:');
  console.error('   // soft-delete-bypass: <reason>\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.snippet}...`);
  }
  console.error(`\n${violations.length} violation(s).`);
  if (!warnOnly) process.exit(1);
  console.error('(--warn) exiting 0 — this run is report-only.');
  process.exit(0);
}

console.log(`Soft-delete guard: 0 violations across ${files.length} files.`);
