// Schémas Zod réutilisables pour la validation server-side des API routes.
// Pattern : importer le schéma → `schema.safeParse(body)` → 400 si !success.
import { z } from 'zod';

export type ZodSchema<T> = z.ZodType<T>;

// ─── Auth / profil ─────────────────────────────────────────────────────────

export const passwordChangeSchema = z.object({
  oldPassword: z.string().min(1, 'oldPassword required').max(200),
  newPassword: z
    .string()
    .min(8, 'min 8 chars')
    .max(200, 'max 200 chars')
    .refine(v => v.trim().length === v.length, 'no leading/trailing spaces'),
});

// ─── Loyalty ───────────────────────────────────────────────────────────────

export const gradeSchema = z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);

export const gradeOverrideSchema = z.object({
  grade: gradeSchema,
});

// ─── Admin users ───────────────────────────────────────────────────────────

export const roleSchema = z.enum(['ADMIN', 'SUPERADMIN', 'CLIENT']);

export const roleChangeSchema = z.object({
  role: roleSchema,
});

// ─── Helper d'extraction des erreurs Zod ─────────────────────────────────

export function formatZodError(err: z.ZodError): { error: string; details: string[] } {
  return {
    error: 'VALIDATION_ERROR',
    details: err.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}
