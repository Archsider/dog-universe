'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-inline-deletedAt-null');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-inline-deletedAt-null', rule, {
  valid: [
    // No deletedAt at all — fine.
    { code: "const w = { role: 'CLIENT' };" },
    // notDeleted helper call — fine (the literal isn't here).
    { code: "const w = notDeleted({ role: 'CLIENT' });" },
    // deletedAt with dynamic value (variable) — out of scope.
    { code: "const w = { deletedAt: someDate };" },
    // deletedAt with a range query — legitimate, not the soft-delete pattern.
    { code: "const w = { deletedAt: { gt: cutoff } };" },
    { code: "const w = { deletedAt: { lt: cutoff } };" },
    // computed key — out of scope (rule doesn't match computed properties).
    { code: "const k = 'deletedAt'; const w = { [k]: null };" },
  ],
  invalid: [
    // The classic case — inline `deletedAt: null`.
    {
      code: "const w = { deletedAt: null };",
      errors: [{ messageId: 'useNotDeleted' }],
    },
    // With other fields next to it.
    {
      code: "const w = { role: 'CLIENT', deletedAt: null };",
      errors: [{ messageId: 'useNotDeleted' }],
    },
    // Inside a Prisma findMany call.
    {
      code: "prisma.user.findMany({ where: { deletedAt: null } });",
      errors: [{ messageId: 'useNotDeleted' }],
    },
    // Trash-view: `deletedAt: { not: null }`.
    {
      code: "const w = { deletedAt: { not: null } };",
      errors: [{ messageId: 'useOnlyDeleted' }],
    },
    // Trash-view with siblings.
    {
      code: "const w = { id: '1', deletedAt: { not: null } };",
      errors: [{ messageId: 'useOnlyDeleted' }],
    },
  ],
});
