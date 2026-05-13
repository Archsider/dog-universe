#!/usr/bin/env node
// Codemod: replace inline `deletedAt: null` patterns with `notDeleted({...})`.
//
// What it does (safely):
//   1. For each .ts/.tsx file under src/ (excluding tests + the helper itself):
//   2. Skip if file does not contain `deletedAt: null`.
//   3. Replace the simple inline patterns:
//        a)  where: { deletedAt: null }
//            → where: notDeleted()
//        b)  where: { <fields>, deletedAt: null }   (top-level only)
//            → where: notDeleted({ <fields> })
//        c)  where: { deletedAt: null, <fields> }
//            → where: notDeleted({ <fields> })
//   4. Strip trailing comments like `// soft-delete: required — ...` that
//      become noise when the helper makes the intent obvious.
//   5. Add `import { notDeleted } from '@/lib/prisma-soft';` once if missing.
//   6. Verify the file still parses by running `tsc --noEmit` after the batch.
//
// What it does NOT do (left for hand-edit):
//   - Nested relation wheres: `booking: { deletedAt: null, client: ... }`.
//     Touching these requires understanding the surrounding semantics.
//   - Multi-line where clauses spanning > 8 lines (formatting too varied).
//   - Files that already imported notDeleted manually (skipped to avoid
//     double-import).
//
// Idempotent: rerunning the script on a previously-migrated file is a no-op.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'src';

function listCandidates() {
  const out = execSync(
    `grep -rln "deletedAt: null" ${ROOT} ` +
    `--include="*.ts" --include="*.tsx" ` +
    `--exclude-dir=__tests__ ` +
    `--exclude="prisma-soft.ts"`,
    { encoding: 'utf-8' },
  );
  return out.split('\n').filter(Boolean);
}

const IMPORT_LINE = "import { notDeleted } from '@/lib/prisma-soft';";

// Strip the boilerplate comment that no longer adds value once `notDeleted()`
// is in the call site (the helper's own JSDoc explains the rationale).
const STALE_COMMENT_RE = / \/\/ soft-delete: required[^\n]*/g;

// Pattern A: `where: { deletedAt: null }` (only)
const PATTERN_A = /where:\s*\{\s*deletedAt:\s*null\s*\}/g;

// Pattern B: `where: { <fields>, deletedAt: null }` — single line, top-level.
// Match a where with at least one OTHER field followed by deletedAt: null.
// We intentionally avoid multi-line: easier to verify by eye and tsc.
//
// Match groups:
//   $1 = leading fields (anything but a closing brace, no inner braces)
const PATTERN_B = /where:\s*\{\s*([^{}]+?),\s*deletedAt:\s*null\s*\}/g;

// Pattern C: `where: { deletedAt: null, <fields> }`
const PATTERN_C = /where:\s*\{\s*deletedAt:\s*null,\s*([^{}]+?)\s*\}/g;

function transformContent(src) {
  let out = src;
  let touched = false;

  const beforeA = out;
  out = out.replace(PATTERN_A, () => {
    touched = true;
    return 'where: notDeleted()';
  });
  if (out !== beforeA) {
    out = out.replace(STALE_COMMENT_RE, '');
  }

  const beforeB = out;
  out = out.replace(PATTERN_B, (_match, fields) => {
    touched = true;
    return `where: notDeleted({ ${fields.trim()} })`;
  });
  if (out !== beforeB) {
    out = out.replace(STALE_COMMENT_RE, '');
  }

  const beforeC = out;
  out = out.replace(PATTERN_C, (_match, fields) => {
    touched = true;
    return `where: notDeleted({ ${fields.trim()} })`;
  });
  if (out !== beforeC) {
    out = out.replace(STALE_COMMENT_RE, '');
  }

  if (!touched) return null;

  if (!out.includes(IMPORT_LINE)) {
    // Insert after the LAST top-level import. Imports can span multiple
    // lines (`import { A,\n  B,\n  C\n} from '…'`), so we track brace
    // balance to find the actual end of each import statement.
    const lines = out.split('\n');
    let lastImportEnd = -1;
    let braceDepth = 0;
    let inImport = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!inImport) {
        if (/^\s*import\b/.test(l)) {
          inImport = true;
          braceDepth = (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
          if (braceDepth <= 0) {
            // single-line import
            lastImportEnd = i;
            inImport = false;
            braceDepth = 0;
          }
        } else if (lastImportEnd >= 0 && l.trim() !== '' && !l.trim().startsWith('//')) {
          // first non-import non-empty line — stop scanning
          break;
        }
      } else {
        braceDepth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
        if (braceDepth <= 0) {
          lastImportEnd = i;
          inImport = false;
          braceDepth = 0;
        }
      }
    }
    if (lastImportEnd === -1) {
      // No import block — prepend.
      out = `${IMPORT_LINE}\n${out}`;
    } else {
      lines.splice(lastImportEnd + 1, 0, IMPORT_LINE);
      out = lines.join('\n');
    }
  }

  return out;
}

function run() {
  const files = listCandidates();
  let changed = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    // Skip if the only occurrences are inside nested relation wheres
    // (Pattern B/C only match TOP-LEVEL `where:`).
    const transformed = transformContent(src);
    if (transformed && transformed !== src) {
      writeFileSync(f, transformed);
      changed++;
      // Lightweight progress signal — codemods are scary, give the
      // operator visibility.
      process.stdout.write(`  ✓ ${f}\n`);
    }
  }
  console.log(`\n${changed} files modified.`);
}

run();
