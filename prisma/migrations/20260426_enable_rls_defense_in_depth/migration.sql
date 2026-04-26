-- ── Defense-in-depth : activer RLS sur les 26 tables Prisma ────────────────
--
-- ARCHITECTURE ACTUELLE :
--   - Aucun client browser-side Supabase. Auth via NextAuth.
--   - Toutes les requêtes DB passent par les API routes Next, via Prisma
--     connecté au pooler Supabase (utilisateur `postgres` avec BYPASSRLS).
--   - Le service_role_key Supabase est utilisé uniquement pour Storage.
--
-- POURQUOI ACTIVER RLS MALGRÉ TOUT :
--   1. Defense-in-depth si une fuite de service_role_key arrive.
--   2. Filet de sécurité si l'app évolue vers du client-side Supabase.
--   3. Best practice Supabase : RLS doit être activé sur toutes les tables
--      publiques (Supabase Dashboard affiche un warning sinon).
--
-- COMPORTEMENT :
--   - L'utilisateur Prisma (`postgres` Supabase) a BYPASSRLS → continue
--     d'accéder à tout (zéro impact runtime).
--   - service_role_key bypass RLS → Storage continue de fonctionner.
--   - anon / authenticated (clients Supabase JS) : PAS de policy = bloqués
--     — c'est l'effet voulu.
--
-- À EXÉCUTER MANUELLEMENT sur Supabase SQL Editor (DB locale inaccessible
-- depuis l'environnement de travail).

-- 26 tables Prisma (issues de schema.prisma)
ALTER TABLE "User"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pet"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PetWeightEntry"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vaccination"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PetDocument"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingPet"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingItem"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardingDetail"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxiDetail"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxiTrip"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxiStatusHistory"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxiLocation"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceItem"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyGrade"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyBenefitClaim"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminNote"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionLog"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StayPhoto"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientContract"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonthlyRevenueSummary"  ENABLE ROW LEVEL SECURITY;

-- Aucune policy créée volontairement :
--   - anon + authenticated → DENIED par défaut (RLS strict)
--   - service_role + postgres → BYPASS automatique (privilèges Supabase)
--
-- Si l'app introduit un jour un client browser-side Supabase, créer des
-- policies fines table par table à ce moment-là (ex: "user can read own pets").
