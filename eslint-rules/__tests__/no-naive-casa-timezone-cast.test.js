'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-naive-casa-timezone-cast');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-naive-casa-timezone-cast', rule, {
  valid: [
    // Safe two-step cast inside $queryRaw.
    {
      filename: '/repo/src/app/api/admin/foo/route.ts',
      code: "await prisma.$queryRaw`SELECT \"paymentDate\" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca' FROM \"Payment\"`;",
    },
    // Safe two-step cast inside $executeRaw, with parentheses.
    {
      filename: '/repo/src/app/api/admin/bar/route.ts',
      code: "await prisma.$executeRaw`UPDATE x SET y = (\"paymentDate\" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'`;",
    },
    // No Casa cast at all — neutral query.
    {
      filename: '/repo/src/app/api/admin/baz/route.ts',
      code: "await prisma.$queryRaw`SELECT id FROM \"Payment\"`;",
    },
    // Cast to UTC only — not the bug pattern (and rarely useful, but legal).
    {
      filename: '/repo/src/app/api/admin/qux/route.ts',
      code: "await prisma.$queryRaw`SELECT \"paymentDate\" AT TIME ZONE 'UTC' FROM \"Payment\"`;",
    },
    // Method name is not a Prisma raw call.
    {
      filename: '/repo/src/app/api/admin/quux/route.ts',
      code: "await prisma.payment.findMany({ where: { id: \"x\" } });",
    },
    // $queryRawUnsafe with safe pattern.
    {
      filename: '/repo/src/app/api/admin/raw/route.ts',
      code: "await prisma.$queryRawUnsafe(\"SELECT col AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca' FROM t\");",
    },
    // Template literal with placeholder — placeholder doesn't break the safe pattern.
    {
      filename: '/repo/src/app/api/admin/tpl/route.ts',
      code: "await prisma.$queryRaw`SELECT col AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca' FROM ${tableName}`;",
    },
    // Comment-mention of the pattern is not in a Prisma call — the rule only
    // scans Prisma raw call arguments, so plain strings elsewhere are ignored.
    {
      filename: '/repo/src/lib/foo.ts',
      code: "const note = \"AT TIME ZONE 'Africa/Casablanca' is dangerous\";",
    },
  ],
  invalid: [
    // Bare Casa cast — the canonical bug pattern.
    {
      filename: '/repo/src/app/api/admin/foo/route.ts',
      code: "await prisma.$queryRaw`SELECT \"paymentDate\" AT TIME ZONE 'Africa/Casablanca' FROM \"Payment\"`;",
      errors: [{ messageId: 'naiveCasa' }],
    },
    // Bare cast in $executeRaw.
    {
      filename: '/repo/src/app/api/admin/bar/route.ts',
      code: "await prisma.$executeRaw`UPDATE x SET y = \"paymentDate\" AT TIME ZONE 'Africa/Casablanca'`;",
      errors: [{ messageId: 'naiveCasa' }],
    },
    // $queryRawUnsafe with bug pattern.
    {
      filename: '/repo/src/app/api/admin/baz/route.ts',
      code: "await prisma.$queryRawUnsafe(\"SELECT col AT TIME ZONE 'Africa/Casablanca' FROM t\");",
      errors: [{ messageId: 'naiveCasa' }],
    },
    // $executeRawUnsafe — also covered.
    {
      filename: '/repo/src/app/api/admin/qux/route.ts',
      code: "await prisma.$executeRawUnsafe(\"UPDATE t SET d = c AT TIME ZONE 'Africa/Casablanca'\");",
      errors: [{ messageId: 'naiveCasa' }],
    },
    // Reverse order (Casa then UTC) — NOT the safe pattern, still bug.
    {
      filename: '/repo/src/app/api/admin/reverse/route.ts',
      code: "await prisma.$queryRaw`SELECT col AT TIME ZONE 'Africa/Casablanca' AT TIME ZONE 'UTC' FROM t`;",
      errors: [{ messageId: 'naiveCasa' }],
    },
  ],
});

console.log('no-naive-casa-timezone-cast: all assertions passed');
