// Schémas Zod réutilisables pour la validation server-side des API routes.
// Pattern : importer le schéma → `schema.safeParse(body)` → 400 si !success.
import { z } from 'zod';

// ─── Auth / profil ─────────────────────────────────────────────────────────

// Password complexity policy: 8+ chars with at least one lowercase, one uppercase, one digit.
// Applied on register, reset-password, password-change, and admin-create-user paths.
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const PASSWORD_COMPLEXITY_MSG =
  'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre';

const strongPassword = () =>
  z
    .string()
    .min(8, 'min 8 chars')
    .max(200, 'max 200 chars')
    .regex(PASSWORD_COMPLEXITY, PASSWORD_COMPLEXITY_MSG);

export const passwordChangeSchema = z.object({
  oldPassword: z.string().min(1, 'oldPassword required').max(200),
  newPassword: strongPassword().refine(
    v => v.trim().length === v.length,
    'no leading/trailing spaces',
  ),
});

// Inscription nouveau client
export const registerSchema = z.object({
  firstName: z
    .string()
    .min(1)
    .max(120)
    .transform(v => v.trim())
    .refine(v => v.length >= 2, 'firstName required (min 2 chars)'),
  lastName: z
    .string()
    .min(1)
    .max(120)
    .transform(v => v.trim())
    .refine(v => v.length >= 2, 'lastName required (min 2 chars)'),
  email: z.string().email('invalid email').max(254).transform(v => v.toLowerCase().trim()),
  phone: z
    .string()
    .max(20)
    .transform(v => v.trim())
    .or(z.literal(''))
    .or(z.null())
    .or(z.undefined())
    .transform(v => (v === '' ? null : v ?? null)),
  password: strongPassword(),
  language: z.enum(['fr', 'en']).optional(),
});

// Demande de reset password (email seulement, anti-enumeration)
export const resetPasswordRequestSchema = z.object({
  email: z.string().email().max(254),
  locale: z.enum(['fr', 'en']).optional().default('fr'),
});

// Confirmation reset password (token + new password)
export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(20).max(100), // UUID v4 = 36, on tolère un peu
  password: strongPassword(),
});

// Update profil client (champs limités)
export const profileUpdateSchema = z.object({
  firstName: z
    .string()
    .max(120)
    .transform(v => v.trim())
    .refine(v => v.length >= 2, 'firstName required (min 2 chars)')
    .optional(),
  lastName: z
    .string()
    .max(120)
    .transform(v => v.trim())
    .refine(v => v.length >= 2, 'lastName required (min 2 chars)')
    .optional(),
  phone: z
    .string()
    .max(20)
    .transform(v => v.trim())
    .nullable()
    .optional(),
});

// ─── Bookings ──────────────────────────────────────────────────────────────

export const serviceTypeSchema = z.enum(['BOARDING', 'PET_TAXI']);
export const taxiTypeSchema = z.enum(['STANDARD', 'VET', 'AIRPORT']);
export const groomingSizeSchema = z.enum(['SMALL', 'LARGE']);
export const bookingSourceSchema = z.enum(['ONLINE', 'MANUAL', 'PHONE', 'EMAIL']);

// Date string ISO (YYYY-MM-DD ou plein ISO) — convertie en Date côté route après parsing.
// On stocke en string dans Zod pour laisser la conversion + validation business
// (date passée / future) à la route qui a le contexte. Le `.refine` garantit
// qu'une string de "garbage" (ex: "not-a-date") est rejetée dès la validation.
const dateStringSchema = z
  .string()
  .min(1, 'date required')
  .max(40)
  .refine(v => !isNaN(new Date(v).getTime()), 'INVALID_DATE');

// Création d'une réservation (client OU admin) — schéma de FORME uniquement.
// Les règles métier (taxi dimanche interdit, plage horaire, ownership des pets)
// restent dans la route car elles dépendent du rôle et du contexte DB.
//
// totalPrice : conservé optionnel mais NEVER trusté côté CLIENT — la route
// `/api/bookings` recalcule systématiquement le prix server-side pour les CLIENT
// (cf. `resolvedTotalPrice` dans route.ts). Le champ n'est lu que pour les ADMIN.
// On le garde dans le schéma pour ne pas casser les payloads admin existants
// passant par /api/bookings au lieu de /api/admin/bookings.
export const bookingCreateSchema = z.object({
  serviceType: serviceTypeSchema,
  petIds: z.array(z.string().min(1)).min(1, 'at least one pet'),
  startDate: dateStringSchema,
  endDate: dateStringSchema.optional().nullable(),
  arrivalTime: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  totalPrice: z.number().nonnegative().optional(),
  source: bookingSourceSchema.optional(),
  clientId: z.string().min(1).optional(), // admin booking on behalf
  // Boarding
  includeGrooming: z.boolean().optional(),
  groomingSize: groomingSizeSchema.optional().nullable(),
  groomingPrice: z.number().nonnegative().optional(),
  pricePerNight: z.number().nonnegative().optional(),
  // Boarding taxi addons
  taxiGoEnabled: z.boolean().optional(),
  taxiGoDate: dateStringSchema.optional().nullable(),
  taxiGoTime: z.string().max(20).optional().nullable(),
  taxiGoAddress: z.string().max(500).optional().nullable(),
  taxiReturnEnabled: z.boolean().optional(),
  taxiReturnDate: dateStringSchema.optional().nullable(),
  taxiReturnTime: z.string().max(20).optional().nullable(),
  taxiReturnAddress: z.string().max(500).optional().nullable(),
  taxiGoLat: z.number().min(-90).max(90).optional().nullable(),
  taxiGoLng: z.number().min(-180).max(180).optional().nullable(),
  taxiReturnLat: z.number().min(-90).max(90).optional().nullable(),
  taxiReturnLng: z.number().min(-180).max(180).optional().nullable(),
  taxiAddonPrice: z.number().nonnegative().optional(),
  // Taxi
  taxiType: taxiTypeSchema.optional(),
  taxiPickupLat: z.number().min(-90).max(90).optional().nullable(),
  taxiPickupLng: z.number().min(-180).max(180).optional().nullable(),
  taxiPickupAddress: z.string().max(500).optional().nullable(),
  taxiDropoffLat: z.number().min(-90).max(90).optional().nullable(),
  taxiDropoffLng: z.number().min(-180).max(180).optional().nullable(),
  taxiDropoffAddress: z.string().max(500).optional().nullable(),
  // Admin items (passé tel quel — chaque item validé séparément si besoin)
  bookingItems: z.array(z.object({
    description: z.string().max(500),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    category: z.string().max(50).optional(),
  })).optional(),
}).refine(
  d => {
    if (!d.endDate) return true;
    const start = new Date(d.startDate).getTime();
    const end = new Date(d.endDate).getTime();
    if (isNaN(start) || isNaN(end)) return true; // dateStringSchema déjà rejeté
    return end >= start;
  },
  { message: 'INVALID_DATE_RANGE', path: ['endDate'] },
);

// Création d'une réservation par un ADMIN (depuis /admin/reservations/new) —
// inclut un cas walk-in (création inline du User + Pets).
// `dateOfBirth` est OBLIGATOIRE depuis 2026-05-11 (cf. règle métier projet :
// anniversaires automatiques + grade fidélité dépendant de l'âge). Les anciens
// walk-in DOB-vides étaient une faille de validation et ont créé un bruit
// statistique sur la pyramide des âges des chiens en pension.
// Walk-in admin path: DOB is OPTIONAL because admins rarely have the info at
// check-in (client de passage). The route handler defensively maps falsy DOB
// to NULL in the Pet row. The strict "DOB required" rule still applies to the
// client-facing forms (CLAUDE.md: dateOfBirth obligatoire côté client/admin
// pet management — walk-in is the documented exception).
const adminWalkInPetSchema = z.object({
  name: z.string().min(1).max(100),
  species: z.enum(['DOG', 'CAT']),
  dateOfBirth: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .refine(
      v => {
        if (!v) return true;
        const d = new Date(v);
        return !isNaN(d.getTime()) && d <= new Date();
      },
      'invalid or future date of birth',
    ),
  breed: z.string().max(100).optional().nullable(),
});

export const adminBookingCreateSchema = z.object({
  clientId: z.string().min(1).optional(),
  walkIn: z
    .object({
      name: z.string().min(1).max(150),
      phone: z.string().min(1).max(40),
      email: z.string().email().max(200).optional().nullable(),
    })
    .optional(),
  petIds: z.array(z.string().min(1)).optional().default([]),
  pets: z.array(adminWalkInPetSchema).optional().default([]),
  serviceType: z.enum(['BOARDING', 'PET_TAXI']),
  startDate: z.string().min(1).max(40),
  endDate: z.string().max(40).optional().nullable(),
  arrivalTime: z.string().max(20).optional().nullable(),
  totalPrice: z.number().min(0).max(1_000_000),
  notes: z.string().max(2000).optional().nullable(),
  createInvoice: z.boolean().optional().default(true),
  isOpenEnded: z.boolean().optional().default(false),
  // Walk-in initial status: admin picks the entry point for the booking.
  // Defaults to IN_PROGRESS (chien déjà là — cas le plus courant).
  initialStatus: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']).optional().default('IN_PROGRESS'),
  // Required when initialStatus === 'COMPLETED' (retroactive entry with known amount).
  finalAmount: z.number().min(0).max(1_000_000).optional().nullable(),
  // Capacity override — explicit opt-in flag the admin must set to
  // overbook the pension on an open-ended walk-in. The capacity probe
  // runs on a 30-day window. Previously the failure was advisory only
  // (warning silently ignored by admins, real overbookings possible
  // — audit finding #7). Now: if the probe fails AND this flag is
  // false, the API refuses with CAPACITY_OVERRIDE_REQUIRED. Setting it
  // to true commits the booking and logs the override in ActionLog
  // for accountability.
  acknowledgeCapacityOverride: z.boolean().optional().default(false),
}).refine(
  d => !!d.clientId || !!d.walkIn,
  { message: 'clientId or walkIn required' },
).refine(
  d => {
    if (!d.endDate) return true;
    const start = new Date(d.startDate).getTime();
    const end = new Date(d.endDate).getTime();
    if (isNaN(start) || isNaN(end)) return true;
    return end >= start;
  },
  { message: 'INVALID_DATE_RANGE', path: ['endDate'] },
).refine(
  d => !(d.isOpenEnded && d.initialStatus === 'COMPLETED'),
  { message: 'WALKIN_OPENENDED_WITH_COMPLETED', path: ['initialStatus'] },
).refine(
  d => !(d.initialStatus === 'COMPLETED' && !d.endDate),
  { message: 'END_DATE_REQUIRED_FOR_COMPLETED', path: ['endDate'] },
).refine(
  d => !(d.isOpenEnded && d.initialStatus === 'PENDING'),
  { message: 'OPEN_ENDED_CANNOT_BE_PENDING', path: ['initialStatus'] },
).refine(
  d => !(d.initialStatus === 'COMPLETED' && (d.finalAmount === undefined || d.finalAmount === null)),
  { message: 'FINAL_AMOUNT_REQUIRED', path: ['finalAmount'] },
);

// Demande d'extension client — body simple
export const bookingExtensionRequestSchema = z.object({
  requestedEndDate: dateStringSchema,
  note: z.string().max(500).optional().nullable(),
});

// Demande d'addon (Pet Taxi / Toilettage / Autre) sur une réservation existante
export const addonRequestSchema = z.object({
  serviceType: z.enum(['PET_TAXI', 'TOILETTAGE', 'AUTRE']),
  message: z.string().max(500).optional(),
});

// PATCH booking côté CLIENT — seul le statut CANCELLED est autorisé
export const bookingClientCancelSchema = z.object({
  status: z.literal('CANCELLED'),
  cancellationReason: z.string().max(500).optional().nullable(),
});

// PATCH booking côté CLIENT — demande de changement de dates (reschedule)
// Soit BOARDING (requestedStartDate + requestedEndDate) soit PET_TAXI (requestedScheduledAt)
const isoDate = z.string().min(1).refine(v => !isNaN(new Date(v).getTime()), 'invalid date');
export const bookingClientRescheduleSchema = z.object({
  requestedStartDate: isoDate.optional(),
  requestedEndDate: isoDate.optional(),
  requestedScheduledAt: isoDate.optional(),
  rescheduleNote: z.string().max(500).optional().nullable(),
}).refine(
  d => (d.requestedStartDate && d.requestedEndDate) || d.requestedScheduledAt,
  { message: 'requestedStartDate+requestedEndDate or requestedScheduledAt required' },
);

// ─── Pets ──────────────────────────────────────────────────────────────────

export const speciesSchema = z.enum(['DOG', 'CAT']);
export const petGenderSchema = z.enum(['MALE', 'FEMALE']);
export const behaviorSchema = z.enum(['SOCIABLE', 'TOLERANT', 'MONITOR', 'REACTIVE']);

// Date de naissance : date string parsable, NON future
const dobSchema = z
  .string()
  .min(1)
  .refine(v => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d <= new Date();
  }, 'invalid or future date of birth');

// Weight : nombre positif (ou null/undefined pour reset)
const weightSchema = z
  .union([z.number(), z.string()])
  .transform(v => (typeof v === 'number' ? v : Number(v)))
  .refine(v => !isNaN(v) && v > 0, 'weight must be positive');

const optionalTrimmedString = (max: number) =>
  z.string().max(max).transform(v => v.trim()).or(z.literal('')).or(z.null()).or(z.undefined())
    .transform(v => (v == null || v === '' ? null : v));

// Création d'un pet (client) — schéma complet
// .strict() — rejette tout champ non whitelisté (ex: ownerId, deletedAt)
// pour empêcher un client de transférer/réassigner un pet via injection
// de payload (IDOR). Tout nouveau champ d'écriture doit être ajouté ici
// explicitement.
export const petCreateSchema = z.object({
  name: z.string().min(1, 'name required').max(100).transform(v => v.trim()),
  species: speciesSchema,
  breed: optionalTrimmedString(100),
  dateOfBirth: dobSchema,
  gender: petGenderSchema.optional().nullable(),
  photoUrl: z.string().max(2048).optional().nullable(),
  isNeutered: z.boolean().optional().nullable(),
  microchipNumber: optionalTrimmedString(50),
  tattooNumber: optionalTrimmedString(50),
  weight: weightSchema.optional().nullable(),
  vetName: optionalTrimmedString(200),
  vetPhone: optionalTrimmedString(30),
  allergies: optionalTrimmedString(1000),
  currentMedication: optionalTrimmedString(1000),
  behaviorWithDogs: behaviorSchema.optional().nullable(),
  behaviorWithCats: behaviorSchema.optional().nullable(),
  behaviorWithHumans: behaviorSchema.optional().nullable(),
  notes: optionalTrimmedString(2000),
  lastAntiparasiticDate: z.string().optional().nullable(),
  antiparasiticProduct: optionalTrimmedString(200),
  antiparasiticNotes: optionalTrimmedString(1000),
}).strict();

// Update pet — toutes les props optionnelles (partial)
// .strict() preserved through .partial().extend() — IDOR guard: blocks
// `ownerId`, `deletedAt`, `createdAt`, `id`, … and any unknown field.
export const petUpdateSchema = petCreateSchema.partial().extend({
  // Admin-only override : durée antiparasitaire forcée
  antiparasiticDurationDays: z.number().int().positive().optional().nullable(),
}).strict();

// ─── Vaccinations ──────────────────────────────────────────────────────────

export const vaccinationCreateSchema = z.object({
  vaccineType: z.string().min(1, 'vaccineType required').max(100).transform(v => v.trim()),
  date: dateStringSchema,
  comment: z.string().max(1000).optional().nullable(),
});

export const vaccinationConfirmSchema = z.object({
  vaccinationId: z.string().min(1),
  vaccineType: z.string().min(1).max(100).transform(v => v.trim()),
  date: dateStringSchema,
  nextDueDate: dateStringSchema.optional().nullable(),
  comment: z.string().max(1000).optional().nullable(),
});

export const vaccinationExtractSchema = z.object({
  documentId: z.string().min(1, 'documentId required'),
});

// ─── Pet documents ─────────────────────────────────────────────────────────

// Pour le `name` field dans formData (le file est validé séparément).
export const petDocumentNameSchema = z.object({
  name: z.string().max(255).optional(),
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
