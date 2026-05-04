// Helpers de conversion Prisma Decimal ↔ number.
//
// Stratégie : la DB stocke en DECIMAL(10,2) pour éviter les dérives
// arithmétiques sur les montants MAD. Le client Prisma matérialise ces
// colonnes en `Prisma.Decimal` (objet runtime). Pour ne pas réécrire toute
// la logique métier en arithmétique Decimal, on convertit en `number`
// dès que possible (au plus près du UI / des calculs JS), via `toNumber()`.
//
// Quand garder Decimal :
//   - Allocations de paiements (lib/payments.ts) — somme exacte au centime.
//   - Comparaisons stricts d'égalité (eq) sur invoice.amount vs paidAmount.
// Sinon, `Number(d)` suffit — la précision est garantie par la DB.

import { Prisma } from '@prisma/client';

export type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/**
 * Convertit un Decimal Prisma (ou number, string) vers number.
 * `null`/`undefined` → 0.
 *
 * Utilisable dans tous les chemins de lecture où la valeur est ensuite
 * formatée (formatMAD), agrégée en JS, ou envoyée au client en JSON.
 */
export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma.Decimal
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convertit en chaîne formatée à 2 décimales (sans symbole monétaire).
 * Pratique pour les inputs HTML <input type="number" step="0.01">.
 */
export function toFixed2(value: DecimalLike): string {
  return toNumber(value).toFixed(2);
}
