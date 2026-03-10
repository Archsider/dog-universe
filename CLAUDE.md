# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint via Next.js

npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Run migrations (dev)
npm run db:push      # Push schema to DB without migration
npm run db:seed      # Seed the database
npm run db:studio    # Open Prisma Studio

npm run setup        # Full init: install + prisma generate + db push + seed
```

There are no automated tests in this project.

## Architecture

**Dog Universe** is a Next.js 14 (App Router) full-stack application for managing a pet boarding/grooming/taxi service in Marrakech, with bilingual support (French/English).

### Routing Structure

All pages live under `src/app/[locale]/` where `[locale]` is `fr` or `en`. Two distinct portals:
- `/[locale]/admin/*` — admin dashboard (analytics, client/booking/pet/invoice management, settings)
- `/[locale]/client/*` — client portal (bookings, pets, invoices, notifications)
- `/[locale]/auth/*` — login, register, password reset

API routes are in `src/app/api/`. Admin-only endpoints under `src/app/api/admin/`.

### Authentication & Middleware

`auth.ts` — NextAuth v5 (beta) with credentials provider, JWT strategy, role field (`ADMIN`/`CLIENT`) on session.

`middleware.ts` — Handles both i18n locale routing (via next-intl) and route protection. Admin routes require `ADMIN` role; client routes require any authenticated session.

### i18n

Config in `src/i18n/`. Translation files in `messages/fr.json` and `messages/en.json`. Use `next-intl` hooks (`useTranslations`) in client components and `getTranslations` in server components. Notifications are stored bilingual in the DB (`messageEn`/`messageFr` fields).

### Database

PostgreSQL via Prisma. Schema at `prisma/schema.prisma`. Singleton client at `src/lib/prisma.ts`.

Key models: `User` (ADMIN/CLIENT), `Pet`, `Booking`, `BoardingDetail`, `TaxiDetail`, `Invoice`, `Notification`, `LoyaltyGrade`, `ActionLog`, `StayPhoto`.

After any schema change: run `npm run db:generate` to update the Prisma client.

### Business Logic (`src/lib/`)

- `pricing.ts` — booking price calculations
- `loyalty.ts` — loyalty grades (BRONZE → PLATINUM) and points
- `notifications.ts` — creates in-app + email + SMS notifications
- `email.ts` — Nodemailer (Ethereal in dev, SMTP env vars in prod)
- `pdf.tsx` — React PDF invoice rendering (`@react-pdf/renderer`)
- `log.ts` — audit trail for admin actions
- `upload.ts` — file uploads (pet photos, documents) saved to `public/uploads/`

### UI

Components in `src/components/ui/` are Radix UI primitives styled with Tailwind. Custom brand colors defined in `tailwind.config.ts`: `ivory`, `gold`, `charcoal`.

### Cron

A daily reminder email runs at 08:00 UTC via a Vercel cron job hitting `/api/cron/reminders` (configured in `vercel.json`).
