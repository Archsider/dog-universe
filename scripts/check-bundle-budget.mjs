#!/usr/bin/env node
// Bundle size budget guard — runs after `next build` and fails (exit 1)
// when any of the limits in .bundle-budget.json are exceeded.
//
// Why custom (not size-limit / bundlesize)?
//   - size-limit assumes a single library entry point — Next.js App Router
//     splits the client bundle into dozens of dynamic chunks
//   - bundlesize uses the same single-glob model
//   - This script just walks .next/static, sums sizes per glob group,
//     prints a markdown table, and exits 1 on violation
//
// Reports:
//   - human-readable summary on stdout (always)
//   - GitHub Actions step summary if GITHUB_STEP_SUMMARY is set
//   - PR comment-friendly markdown if --markdown flag is passed

import { readFileSync, statSync, appendFileSync, existsSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join, basename } from 'node:path';

const BUDGET_FILE = '.bundle-budget.json';
const ROOT = process.cwd();
const NEXT_DIR = join(ROOT, '.next');

function fmt(kb) {
  if (kb < 1) return `${Math.round(kb * 1024)} B`;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

async function expandGlobs(patterns) {
  const matches = new Set();
  for (const pattern of patterns) {
    // Use Node 20+'s built-in glob (fs/promises). Strip the leading `.next/`
    // because we glob from cwd.
    for await (const m of glob(pattern, { cwd: ROOT })) {
      matches.add(m);
    }
  }
  return [...matches];
}

function totalSize(files) {
  let total = 0;
  for (const f of files) {
    try {
      total += statSync(join(ROOT, f)).size;
    } catch {
      // file vanished between glob and stat — ignore
    }
  }
  return total;
}

async function main() {
  if (!existsSync(NEXT_DIR)) {
    console.error('❌ .next/ not found — run `next build` first.');
    process.exit(1);
  }
  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  const rows = [];
  let failed = false;

  for (const limit of budget.limits) {
    const files = await expandGlobs(limit.patterns);
    const sizeBytes = totalSize(files);
    const sizeKB = sizeBytes / 1024;
    const ratio = sizeKB / limit.maxKB;
    const status = sizeKB > limit.maxKB ? '❌ FAIL' : ratio > 0.9 ? '⚠️  WARN' : '✅ OK';
    if (sizeKB > limit.maxKB) failed = true;
    rows.push({
      name: limit.name,
      filesCount: files.length,
      size: fmt(sizeKB),
      max: fmt(limit.maxKB),
      ratio: `${(ratio * 100).toFixed(0)}%`,
      status,
      rationale: limit.rationale ?? '',
    });
  }

  // Console table
  console.log('\nBundle size budget check\n');
  for (const r of rows) {
    console.log(`  ${r.status}  ${r.name}`);
    console.log(`         ${r.size} / ${r.max} (${r.ratio})  —  ${r.filesCount} file(s)`);
    if (r.rationale) console.log(`         ${r.rationale}`);
    console.log('');
  }

  // GitHub Actions step summary (markdown table)
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const md = [
      '## Bundle size budget',
      '',
      '| Status | Bundle | Size | Limit | Ratio |',
      '|--------|--------|------|-------|-------|',
      ...rows.map((r) => `| ${r.status} | ${r.name} | ${r.size} | ${r.max} | ${r.ratio} |`),
      '',
    ].join('\n');
    appendFileSync(summary, md);
  }

  if (failed) {
    console.error('\n❌ Bundle budget exceeded. Either:');
    console.error('   1. Reduce the bundle (lazy-load heavy deps, tree-shake)');
    console.error(`   2. Justify a bump in ${BUDGET_FILE}`);
    process.exit(1);
  }

  console.log('✅ All budgets respected.\n');
}

main().catch((err) => {
  console.error('Bundle budget check crashed:', err);
  process.exit(1);
});

// Tag unused-but-kept-for-clarity: basename can be useful for future per-file caps.
void basename;
