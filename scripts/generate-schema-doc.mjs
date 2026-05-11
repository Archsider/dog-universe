#!/usr/bin/env node
/**
 * Generate docs/SCHEMA.md from prisma/schema.prisma.
 *
 * Parses the schema (lightweight regex — no Prisma SDK needed) and produces
 * a Markdown reference: one section per model + enum, with fields, types,
 * defaults, relations and indexes.
 *
 * Run manually or via `npm run db:doc` after each migration.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '../prisma/schema.prisma');
const OUT_PATH = resolve(__dirname, '../docs/SCHEMA.md');

const src = readFileSync(SCHEMA_PATH, 'utf8');

const models = [];
const enums = [];

const modelRegex = /(\/\/\/[^\n]*\n|\/\/[^\n]*\n)*model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

let m;
while ((m = modelRegex.exec(src)) !== null) {
  const [, leadingComments = '', name, body] = m;
  const doc = (leadingComments || '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/\/?\s?/, '').trim())
    .filter(Boolean)
    .join(' ');

  const fields = [];
  const indexes = [];
  const uniques = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('@@index')) {
      indexes.push(line.replace('@@index', '').trim());
      continue;
    }
    if (line.startsWith('@@unique')) {
      uniques.push(line.replace('@@unique', '').trim());
      continue;
    }
    if (line.startsWith('@@')) continue;

    const fieldMatch = line.match(/^(\w+)\s+([\w\[\]?]+)(.*)$/);
    if (!fieldMatch) continue;
    const [, fname, ftype, rest] = fieldMatch;
    const attrs = rest.trim();

    const isRelation = /@relation/.test(attrs);
    const isId = /@id\b/.test(attrs);
    const isUnique = /@unique\b/.test(attrs);
    const defaultMatch = attrs.match(/@default\(([^)]+)\)/);
    const dbType = attrs.match(/@db\.\w+(?:\([^)]+\))?/)?.[0];

    fields.push({
      name: fname,
      type: ftype,
      isRelation,
      isId,
      isUnique,
      default: defaultMatch?.[1],
      dbType,
      // Pull trailing inline comment for the field
      comment: rawLine.match(/\/\/\s*(.+)$/)?.[1]?.trim(),
    });
  }

  models.push({ name, doc, fields, indexes, uniques });
}

while ((m = enumRegex.exec(src)) !== null) {
  const [, name, body] = m;
  const values = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  enums.push({ name, values });
}

const lines = [];
lines.push('# SCHEMA.md — Référence base de données');
lines.push('');
lines.push(`> Généré automatiquement depuis \`prisma/schema.prisma\`. Ne pas éditer à la main.`);
lines.push(`> Régénérer avec \`node scripts/generate-schema-doc.mjs\` (ou \`npm run db:doc\`).`);
lines.push('');
lines.push(`**${models.length} modèles** · **${enums.length} enums** · ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push('## Sommaire');
lines.push('');
for (const model of models) {
  lines.push(`- [${model.name}](#${model.name.toLowerCase()})`);
}
if (enums.length) {
  lines.push('');
  lines.push('### Enums');
  for (const e of enums) lines.push(`- [${e.name}](#enum-${e.name.toLowerCase()})`);
}
lines.push('');
lines.push('---');
lines.push('');

for (const model of models) {
  lines.push(`## ${model.name}`);
  lines.push('');
  if (model.doc) {
    lines.push(`> ${model.doc}`);
    lines.push('');
  }

  const scalar = model.fields.filter((f) => !f.isRelation);
  const relations = model.fields.filter((f) => f.isRelation);

  if (scalar.length) {
    lines.push('| Champ | Type | Attributs | Commentaire |');
    lines.push('|---|---|---|---|');
    for (const f of scalar) {
      const attrs = [];
      if (f.isId) attrs.push('PK');
      if (f.isUnique) attrs.push('UNIQUE');
      if (f.default) attrs.push(`default=\`${f.default}\``);
      if (f.dbType) attrs.push(`\`${f.dbType}\``);
      lines.push(`| \`${f.name}\` | \`${f.type}\` | ${attrs.join(' · ') || '—'} | ${f.comment ?? ''} |`);
    }
    lines.push('');
  }

  if (relations.length) {
    lines.push('**Relations**');
    lines.push('');
    for (const r of relations) {
      lines.push(`- \`${r.name}\` → \`${r.type}\`${r.comment ? ` — ${r.comment}` : ''}`);
    }
    lines.push('');
  }

  if (model.uniques.length) {
    lines.push('**Uniques composites :** ' + model.uniques.map((u) => `\`${u}\``).join(', '));
    lines.push('');
  }

  if (model.indexes.length) {
    lines.push('**Indexes :**');
    for (const idx of model.indexes) lines.push(`- \`${idx}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
}

if (enums.length) {
  lines.push('## Enums');
  lines.push('');
  for (const e of enums) {
    lines.push(`### enum ${e.name}`);
    lines.push('');
    for (const v of e.values) lines.push(`- \`${v}\``);
    lines.push('');
  }
}

writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`✓ SCHEMA.md généré : ${models.length} modèles, ${enums.length} enums → ${OUT_PATH}`);
