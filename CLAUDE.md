# CLAUDE.md — Dog Universe Codebase Guide

> This file is intended for AI assistants. It documents the project structure, conventions, and workflows for the Dog Universe pet boarding & taxi management system.

---

## STRICT INSTRUCTIONS

> **These rules are mandatory. Never deviate from them without explicit user approval.**

### 1. Forbidden Practices & Libraries
- [ENTER RULE HERE] — e.g., "Never use `any` in TypeScript"
- [ENTER RULE HERE] — e.g., "Do not install new npm packages without approval"
- [ENTER RULE HERE] — e.g., "Never commit secrets or `.env` values"

### 2. Mandatory Architectural Patterns
- [ENTER RULE HERE] — e.g., "All API calls from client components must go through `/api/` route handlers, never use Prisma directly in components"
- [ENTER RULE HERE] — e.g., "All server-side DB access must use the singleton from `src/lib/prisma.ts`"
- [ENTER RULE HERE] — e.g., "Business logic belongs in `src/lib/`, not in route handlers or components"

### 3. Mandatory Formatting Rules
- [ENTER RULE HERE] — e.g., "Use 2-space indentation"
- [ENTER RULE HERE] — e.g., "All user-facing strings must go through next-intl — no hardcoded French or English strings in components"
- [ENTER RULE HERE] — e.g., "Currency must always be formatted with `formatMAD()` from `src/lib/utils.ts`"

---

## Project Overview

**Dog Universe** is a bilingual (French/English) pet boarding and taxi management SaaS.

- **Target Users:** Pet boarding business operators (admin) and their clients (pet owners)
- **Core Services:** Dog/cat boarding, pet taxi (standard, vet, airport), grooming add-ons
- **Currency:** Moroccan Dirham (MAD)
- **Deployment:** Vercel with PostgreSQL (Supabase)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth v5 (JWT, Credentials provider) |
| Styling | Tailwind CSS + Radix UI primitives |
| i18n | next-intl (fr default, en supported) |
| Forms | React Hook Form + Zod |
| Email | Nodemailer (Ethereal in dev, SMTP in prod) |
| SMS | Twilio (`src/lib/sms.ts`) |
| PDF | @react-pdf/renderer + Sharp |
| Charts | Recharts |
| Icons | Lucide React |
| Deployment | Vercel (with cron jobs) |

---

## Directory Structure

```
/
├── prisma/
│   ├── schema.prisma        # Database schema — source of truth for all models
│   └── seed.ts              # Dev seed: admin + sample client, pets, bookings
│
├── src/
│   ├── app/
│   │   ├── [locale]/        # All UI routes are locale-prefixed (fr/en)
│   │   │   ├── admin/       # Admin-only pages (requires ADMIN role)
│   │   │   │   ├── analytics/
│   │   │   │   ├── animals/
│   │   │   │   ├── billing/
│   │   │   │   ├── calendar/
│   │   │   │   ├── clients/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── logs/
│   │   │   │   ├── profile/
│   │   │   │   ├── reservations/
│   │   │   │   └── settings/
│   │   │   ├── auth/        # Public auth pages (login, register, reset-password)
│   │   │   └── client/      # Authenticated client portal
│   │   │       ├── bookings/
│   │   │       ├── dashboard/
│   │   │       ├── history/
│   │   │       ├── invoices/
│   │   │       ├── notifications/
│   │   │       ├── pets/
│   │   │       └── profile/
│   │   └── api/             # All REST API route handlers
│   │       ├── admin/       # Admin operations
│   │       ├── auth/        # NextAuth handler
│   │       ├── bookings/    # Booking CRUD
│   │       ├── cron/        # Scheduled tasks
│   │       ├── invoices/    # Invoice + PDF
│   │       ├── notifications/
│   │       ├── pets/        # Pet + documents + vaccinations
│   │       ├── profile/     # User profile + password
│   │       ├── register/
│   │       ├── reset-password/
│   │       └── uploads/
│   │
│   ├── components/
│   │   ├── admin/           # Admin-specific UI components
│   │   ├── layout/          # Sidebars, language switcher, notification bell
│   │   ├── landing/         # Public landing page
│   │   ├── pets/            # Pet records (docs, vaccinations)
│   │   ├── shared/          # Cross-role reusable components
│   │   └── ui/              # Radix UI wrappers (button, card, dialog, etc.)
│   │
│   ├── lib/                 # Business logic and utilities — keep logic HERE
│   │   ├── email.ts         # Nodemailer email templates & sender
│   │   ├── log.ts           # Audit logging (23 action types)
│   │   ├── loyalty.ts       # Loyalty grade calculation logic
│   │   ├── notifications.ts # In-app notification creation (8 types)
│   │   ├── pdf.tsx          # Invoice PDF generation with @react-pdf/renderer
│   │   ├── pricing.ts       # Booking price calculation (configurable via DB)
│   │   ├── prisma.ts        # Prisma singleton — always import from here
│   │   ├── sms.ts           # Twilio SMS helper
│   │   ├── upload.ts        # File upload handling (pets, documents)
│   │   └── utils.ts         # Shared helpers (formatMAD, formatDate, cn, etc.)
│   │
│   ├── hooks/
│   │   └── use-toast.ts     # Toast notification hook
│   │
│   ├── i18n/
│   │   ├── routing.ts       # Locale routing config
│   │   ├── request.ts       # Per-request locale resolution
│   │   └── navigation.ts    # next-intl navigation helpers
│   │
│   ├── messages/
│   │   ├── fr.json          # French translations (default locale)
│   │   └── en.json          # English translations
│   │
│   └── types/
│       └── next-auth.d.ts   # Augmented session/user types
│
├── public/uploads/
│   ├── pets/                # Pet photos
│   └── documents/           # Pet medical documents
│
├── auth.ts                  # NextAuth configuration
├── middleware.ts            # Auth guards + locale prefixing
├── next.config.mjs          # Next.js config (next-intl plugin, webpack canvas alias)
├── tailwind.config.ts       # Custom design tokens (luxury theme)
└── vercel.json              # Cron: /api/cron/reminders at 08:00 UTC daily
```

---

## Database (Prisma)

### Key Models

| Model | Purpose |
|---|---|
| `User` | Clients & admins. Roles: `ADMIN`, `CLIENT` |
| `Pet` | Dogs/cats owned by a client |
| `Booking` | Core entity. Types: `BOARDING`, `PET_TAXI` |
| `BoardingDetail` | Grooming & taxi add-on details for boarding |
| `TaxiDetail` | Taxi type: `STANDARD`, `VET`, `AIRPORT` |
| `Invoice` | Financial records with line items |
| `Notification` | Bilingual in-app notifications |
| `LoyaltyGrade` | Auto-calculated or admin-overridden grade |
| `AdminNote` | Admin notes on clients/pets |
| `ActionLog` | Full audit trail |
| `Setting` | DB-driven config (pricing, etc.) |
| `StayPhoto` | Photos taken during a boarding stay |
| `PasswordResetToken` | Secure reset tokens |
| `Vaccination` | Pet vaccination records |
| `PetDocument` | Pet medical/identity documents |

### Rules
- **Always import Prisma from `src/lib/prisma.ts`** — never instantiate `PrismaClient` directly.
- Schema changes: `npm run db:migrate` (dev with migration file) or `npm run db:push` (quick sync).
- Cascading deletes are configured on pet/booking relationships.

---

## Authentication & Authorization

- **Provider:** Credentials (email + bcryptjs password)
- **Session:** JWT, 30-day expiry
- **Roles:** `ADMIN` | `CLIENT`
- **Session shape:**
  ```typescript
  session.user = {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CLIENT';
    language: string; // 'fr' | 'en'
  }
  ```
- **Public routes** (no auth): `/auth/*`, `/api/auth/*`, `/api/register`, `/api/reset-password`
- **Admin routes**: `/[locale]/admin/*` and `/api/admin/*` — reject non-ADMIN sessions
- **Client routes**: `/[locale]/client/*` — reject unauthenticated sessions
- Always validate role inside API route handlers. Do not rely solely on middleware.

---

## API Conventions

- All API routes live under `src/app/api/`
- Use Next.js Route Handlers (`route.ts` with named exports: `GET`, `POST`, `PATCH`, `DELETE`)
- Authenticate with `auth()` from `auth.ts` at the top of every handler
- Return consistent JSON: `{ data }` on success, `{ error: string }` on failure
- Use Zod for request body validation
- Admin routes must explicitly check `session.user.role === 'ADMIN'`

**Standard handler pattern:**
```typescript
import { auth } from '@/../../auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // ... business logic using prisma
}
```

---

## Business Logic (`src/lib/`)

### Pricing (`pricing.ts`)
Prices are configurable via the `Setting` model. Defaults:

| Service | Rate |
|---|---|
| Boarding – single dog (≤32 nights) | 120 MAD/night |
| Boarding – single dog (>32 nights) | 100 MAD/night |
| Boarding – multiple dogs | 100 MAD/dog/night |
| Boarding – cats | 70 MAD/night |
| Grooming – small dog | 100 MAD |
| Grooming – large dog | 150 MAD |
| Taxi – standard | 150 MAD |
| Taxi – vet/airport | 300 MAD |

### Loyalty Grades (`loyalty.ts`)
Auto-calculated; admin can override with audit trail:

| Grade | Condition |
|---|---|
| BRONZE | 1–3 completed stays |
| SILVER | 4–9 completed stays |
| GOLD | 10–19 completed stays |
| PLATINUM | 20+ stays OR ≥55,000 MAD total revenue |

### Notifications (`notifications.ts`)
8 types: `BOOKING_CONFIRMATION`, `BOOKING_VALIDATION`, `BOOKING_REFUSAL`, `STAY_REMINDER`, `INVOICE_AVAILABLE`, `ADMIN_MESSAGE`, `STAY_PHOTO`, `LOYALTY_UPDATE`

Always bilingual — pass both `messageFr` and `messageEn`.

### Audit Logging (`log.ts`)
23 tracked action types. Call `logAction()` after every state-changing operation. It is non-blocking (internally wrapped in try/catch).

### Utilities (`utils.ts`)

| Function | Use |
|---|---|
| `cn(...classes)` | Merge Tailwind class names (clsx + tailwind-merge) |
| `formatMAD(amount)` | Format number as Moroccan Dirham |
| `formatDate(date, locale)` | Locale-aware date formatting |
| `calculateNights(start, end)` | Booking duration |
| `getInitials(name)` | Avatar initials |
| `calculateAge(birthDate)` | Pet age |
| `generateInvoiceNumber()` | Format: `DU-YYYY-0000` |
| `getLoyaltyGradeColor(grade)` | Tailwind color class |
| `getBookingStatusColor(status)` | Status-based Tailwind class |

---

## Internationalisation (i18n)

- **Default locale:** `fr` (French)
- **Supported:** `fr`, `en`
- All UI routes are locale-prefixed: `/fr/admin/...`, `/en/client/...`
- Translation files: `src/messages/fr.json`, `src/messages/en.json`
- Use `useTranslations()` in client components, `getTranslations()` in server components/API routes
- **Never hardcode user-facing strings** — always use translation keys

---

## Styling Conventions

- Utility-first with Tailwind CSS
- **Design theme:** Luxury/elegant — Ivory, Gold, Cream, Charcoal palette
- **Fonts:** Playfair Display (headings), Inter (body)
- **Component primitives:** Radix UI wrappers in `src/components/ui/`
- Use `cn()` from `src/lib/utils.ts` for conditional class composition
- Custom gold shadow utility: `shadow-gold`

---

## Development Workflow

### Setup
```bash
npm run setup
# expands to: npm install && npx prisma generate && npx prisma db push && npm run db:seed
```

### Common Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Create and apply a migration (dev)
npm run db:push      # Sync schema without migration file
npm run db:seed      # Seed sample data
npm run db:studio    # Open Prisma Studio GUI
```

### Required Environment Variables
```env
DATABASE_URL=             # PostgreSQL connection string (pooled)
DIRECT_URL=               # PostgreSQL direct URL (for migrations)
NEXTAUTH_SECRET=          # JWT signing secret
NEXTAUTH_URL=             # Auth callback base URL
NODE_ENV=                 # development | production

# Email (production SMTP — dev uses Ethereal automatically)
EMAIL_SERVER_HOST=
EMAIL_SERVER_PORT=
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=

# Twilio (optional, for SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## Deployment

- **Platform:** Vercel
- **Cron job:** `POST /api/cron/reminders` — daily at 08:00 UTC (booking reminders)
- No CI/CD pipeline (.github/ not present)

---

## Seed Accounts (Development Only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@doguniverse.ma` | `Admin2024!` |
| Client | `marie.dupont@email.com` | `Marie2024!` |

---

## Key Patterns to Always Follow

1. **Prisma singleton** — always `import prisma from '@/lib/prisma'`
2. **Auth check first** — every API handler starts with `const session = await auth()`
3. **Explicit role validation** — check `session.user.role` inside the handler, not only in middleware
4. **Business logic in `lib/`** — keep route handlers thin, logic in lib files
5. **Translations mandatory** — no raw strings in UI components
6. **Pricing from DB** — use `pricing.ts` helpers, never hardcode prices
7. **Audit trail** — call `logAction()` after any create/update/delete
8. **Non-blocking side effects** — wrap email/SMS/log calls in try/catch
9. **Currency formatting** — always use `formatMAD()` for monetary values
10. **Invoice numbers** — always use `generateInvoiceNumber()` → format `DU-YYYY-0000`
