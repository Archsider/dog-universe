# SCHEMA.md — Référence base de données

> Généré automatiquement depuis `prisma/schema.prisma`. Ne pas éditer à la main.
> Régénérer avec `node scripts/generate-schema-doc.mjs` (ou `npm run db:doc`).

**34 modèles** · **1 enums** · 2026-05-11

## Sommaire

- [User](#user)
- [Pet](#pet)
- [PetWeightEntry](#petweightentry)
- [Vaccination](#vaccination)
- [PetDocument](#petdocument)
- [Booking](#booking)
- [BookingPet](#bookingpet)
- [BookingItem](#bookingitem)
- [BoardingDetail](#boardingdetail)
- [TaxiDetail](#taxidetail)
- [TaxiTrip](#taxitrip)
- [TaxiStatusHistory](#taxistatushistory)
- [TaxiLocation](#taxilocation)
- [Invoice](#invoice)
- [InvoiceItem](#invoiceitem)
- [Payment](#payment)
- [Notification](#notification)
- [LoyaltyGrade](#loyaltygrade)
- [LoyaltyBenefitClaim](#loyaltybenefitclaim)
- [AdminNote](#adminnote)
- [ActionLog](#actionlog)
- [Setting](#setting)
- [StayPhoto](#stayphoto)
- [Review](#review)
- [RescheduleRequest](#reschedulerequest)
- [AddonRequest](#addonrequest)
- [PasswordResetToken](#passwordresettoken)
- [ClientContract](#clientcontract)
- [Product](#product)
- [MonthlyRevenueSummary](#monthlyrevenuesummary)
- [InvoiceSequence](#invoicesequence)
- [GuardianEvent](#guardianevent)
- [Heartbeat](#heartbeat)
- [FeatureFlag](#featureflag)

### Enums
- [ItemCategory](#enum-itemcategory)

---

## User

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `email` | `String` | UNIQUE |  |
| `name` | `String` | — | Auto-synced = `${firstName} ${lastName}` — kept for legacy callers |
| `firstName` | `String` | — |  |
| `lastName` | `String` | — |  |
| `phone` | `String?` | — |  |
| `passwordHash` | `String` | — |  |
| `role` | `String` | default=`"CLIENT"` | "ADMIN" | "CLIENT" | "SUPERADMIN" |
| `language` | `String` | default=`"fr"` |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `tokenVersion` | `Int` | default=`0` |  |
| `isWalkIn` | `Boolean` | default=`false` |  |
| `anonymizedAt` | `DateTime?` | — |  |
| `historicalStays` | `Int` | default=`0` |  |
| `historicalSpendMAD` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `historicalNote` | `String?` | — |  |
| `deletedAt` | `DateTime?` | — | Soft-delete — null = active, non-null = archived |
| `totpSecret` | `String?` | — |  |
| `totpEnabled` | `Boolean` | default=`false` |  |
| `totpVerifiedAt` | `DateTime?` | — |  |
| `lastTotpToken` | `String?` | — |  |
| `lastTotpUsedAt` | `DateTime?` | — |  |
| `pets` | `Pet[]` | — |  |
| `bookings` | `Booking[]` | — |  |
| `invoices` | `Invoice[]` | — |  |
| `notifications` | `Notification[]` | — |  |
| `loyaltyGrade` | `LoyaltyGrade?` | — |  |
| `actionLogs` | `ActionLog[]` | — |  |
| `passwordResets` | `PasswordResetToken[]` | — |  |
| `contract` | `ClientContract?` | — |  |
| `benefitClaims` | `LoyaltyBenefitClaim[]` | — |  |
| `revenueSummaries` | `MonthlyRevenueSummary[]` | — |  |
| `reviews` | `Review[]` | — |  |

**Relations**

- `adminNotes` → `AdminNote[]`
- `reviewedClaims` → `LoyaltyBenefitClaim[]`

**Indexes :**
- `([deletedAt])`

---

## Pet

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `ownerId` | `String` | — |  |
| `name` | `String` | — |  |
| `species` | `String` | — | "DOG" | "CAT" |
| `breed` | `String?` | — |  |
| `dateOfBirth` | `DateTime?` | — |  |
| `gender` | `String?` | — | "MALE" | "FEMALE" |
| `photoUrl` | `String?` | — |  |
| `isNeutered` | `Boolean?` | — |  |
| `microchipNumber` | `String?` | — |  |
| `tattooNumber` | `String?` | — |  |
| `weight` | `Float?` | — | kg |
| `vetName` | `String?` | — |  |
| `vetPhone` | `String?` | — |  |
| `allergies` | `String?` | — |  |
| `currentMedication` | `String?` | — |  |
| `behaviorWithDogs` | `String?` | — |  |
| `behaviorWithCats` | `String?` | — |  |
| `behaviorWithHumans` | `String?` | — |  |
| `notes` | `String?` | — |  |
| `lastAntiparasiticDate` | `DateTime?` | — |  |
| `antiparasiticProduct` | `String?` | — |  |
| `antiparasiticNotes` | `String?` | — |  |
| `antiparasiticDurationDays` | `Int?` | — | Admin-only override (days). Null = use product default. |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `deletedAt` | `DateTime?` | — | Soft-delete — null = active, non-null = archived |
| `vaccinations` | `Vaccination[]` | — |  |
| `documents` | `PetDocument[]` | — |  |
| `bookingPets` | `BookingPet[]` | — |  |
| `weightEntries` | `PetWeightEntry[]` | — |  |

**Relations**

- `owner` → `User`

**Indexes :**
- `([ownerId])`
- `([deletedAt])`

---

## PetWeightEntry

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `petId` | `String` | — |  |
| `weightKg` | `Float` | — |  |
| `measuredAt` | `DateTime` | default=`now(` |  |
| `note` | `String?` | — |  |

**Relations**

- `pet` → `Pet`

**Indexes :**
- `([petId])`
- `([measuredAt])`

---

## Vaccination

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `petId` | `String` | — |  |
| `date` | `DateTime?` | — |  |
| `vaccineType` | `String` | default=`""` |  |
| `nextDueDate` | `DateTime?` | — |  |
| `comment` | `String?` | — |  |
| `status` | `String` | default=`"CONFIRMED"` | "CONFIRMED" | "DRAFT" |
| `isAutoDetected` | `Boolean` | default=`false` |  |
| `sourceDocumentId` | `String?` | — | PetDocument.id reference (informational, no FK) |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `pet` → `Pet`

**Indexes :**
- `([petId])`
- `([status])`

---

## PetDocument

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `petId` | `String` | — |  |
| `name` | `String` | — |  |
| `fileUrl` | `String` | — |  |
| `storageKey` | `String?` | — |  |
| `fileType` | `String` | — |  |
| `uploadedAt` | `DateTime` | default=`now(` |  |

**Relations**

- `pet` → `Pet`

**Indexes :**
- `([petId])`

---

## Booking

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `clientId` | `String` | — |  |
| `serviceType` | `String` | — | "BOARDING" | "PET_TAXI" |
| `status` | `String` | default=`"PENDING"` | "PENDING" | "CONFIRMED" | "AT_PICKUP" | "IN_PROGRESS" | "CANCELLED" | "REJECTED" | "COMPLETED" | "NO_SHOW" | "WAITLIST" | "PENDING_EXTENSION" |
| `startDate` | `DateTime` | — |  |
| `endDate` | `DateTime?` | — |  |
| `isOpenEnded` | `Boolean` | default=`false` | séjour à durée indéterminée — endDate fixé au checkout |
| `arrivalTime` | `String?` | — |  |
| `notes` | `String?` | — |  |
| `cancellationReason` | `String?` | — |  |
| `totalPrice` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `source` | `String?` | — | "ONLINE" | "MANUAL" — null = legacy / unknown |
| `hasExtensionRequest` | `Boolean` | default=`false` |  |
| `extensionRequestedEndDate` | `DateTime?` | — |  |
| `extensionRequestNote` | `String?` | — |  |
| `extensionForBookingId` | `String?` | — |  |
| `idempotencyKey` | `String?` | UNIQUE | deterministic key: userId:startDate:endDate:petId1:petId2… |
| `deletedAt` | `DateTime?` | — |  |
| `version` | `Int` | default=`0` | optimistic concurrency lock |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `bookingPets` | `BookingPet[]` | — |  |
| `bookingItems` | `BookingItem[]` | — |  |
| `boardingDetail` | `BoardingDetail?` | — |  |
| `taxiDetail` | `TaxiDetail?` | — |  |
| `taxiTrips` | `TaxiTrip[]` | — |  |
| `invoice` | `Invoice?` | — |  |
| `stayPhotos` | `StayPhoto[]` | — |  |
| `review` | `Review?` | — |  |
| `rescheduleRequest` | `RescheduleRequest?` | — |  |
| `addonRequests` | `AddonRequest[]` | — |  |

**Relations**

- `client` → `User`

**Indexes :**
- `([clientId])`
- `([status])`
- `([startDate])`
- `([endDate])`
- `([createdAt])`
- `([serviceType])`
- `([deletedAt])`
- `([status, startDate]) // Hot path : cron reminders + capacity overlap`
- `([status, endDate])   // Hot path : cron reminders end + capacity overlap`

---

## BookingPet

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `petId` | `String` | — |  |

**Relations**

- `booking` → `Booking`
- `pet` → `Pet`

**Uniques composites :** `([bookingId, petId])`

**Indexes :**
- `([petId])`
- `([bookingId])`

---

## BookingItem

> Extra billable lines added manually by admin at booking time (products, custom services)

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `description` | `String` | — |  |
| `quantity` | `Int` | default=`1` |  |
| `unitPrice` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `total` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `category` | `ItemCategory` | default=`OTHER` |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([bookingId])`

---

## BoardingDetail

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | UNIQUE |  |
| `includeGrooming` | `Boolean` | default=`false` |  |
| `groomingSize` | `String?` | — | "SMALL" | "LARGE" |
| `groomingPrice` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `groomingStatus` | `String?` | — | "PLANNED" | "IN_PROGRESS" | "DONE" — null si pas de toilettage |
| `pricePerNight` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `taxiGoEnabled` | `Boolean` | default=`false` |  |
| `taxiGoDate` | `String?` | — |  |
| `taxiGoTime` | `String?` | — |  |
| `taxiGoAddress` | `String?` | — |  |
| `taxiGoLat` | `Float?` | — |  |
| `taxiGoLng` | `Float?` | — |  |
| `taxiReturnEnabled` | `Boolean` | default=`false` |  |
| `taxiReturnDate` | `String?` | — |  |
| `taxiReturnTime` | `String?` | — |  |
| `taxiReturnAddress` | `String?` | — |  |
| `taxiReturnLat` | `Float?` | — |  |
| `taxiReturnLng` | `Float?` | — |  |
| `taxiAddonPrice` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |

**Relations**

- `booking` → `Booking`

---

## TaxiDetail

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | UNIQUE |  |
| `taxiType` | `String` | — | "STANDARD" | "VET" | "AIRPORT" |
| `price` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `pickupLat` | `Float?` | — |  |
| `pickupLng` | `Float?` | — |  |
| `pickupAddress` | `String?` | — |  |
| `dropoffLat` | `Float?` | — |  |
| `dropoffLng` | `Float?` | — |  |
| `dropoffAddress` | `String?` | — |  |

**Relations**

- `booking` → `Booking`

---

## TaxiTrip

> and provides the TaxiStatusHistory log.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `tripType` | `String` | — | "OUTBOUND" | "RETURN" | "STANDALONE" |
| `status` | `String` | default=`"PLANNED"` |  |
| `date` | `String?` | — |  |
| `time` | `String?` | — |  |
| `address` | `String?` | — |  |
| `taxiType` | `String?` | — | "STANDARD" | "VET" | "AIRPORT" — STANDALONE only |
| `trackingActive` | `Boolean` | default=`false` |  |
| `trackingToken` | `String?` | UNIQUE | public token (HMAC-signed), allows client tracking without auth |
| `trackingTokenExpiresAt` | `DateTime?` | — | hard expiry: token returns 410 Gone past this point |
| `distanceKm` | `Float` | default=`0` | cumulative trip distance (haversine, incremented on each GPS push) |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `history` | `TaxiStatusHistory[]` | — |  |
| `locations` | `TaxiLocation[]` | — |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([bookingId])`

---

## TaxiStatusHistory

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `taxiTripId` | `String` | — |  |
| `status` | `String` | — |  |
| `timestamp` | `DateTime` | default=`now(` |  |
| `updatedBy` | `String` | — | userId admin or "MIGRATION" |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `taxiTrip` → `TaxiTrip`

**Indexes :**
- `([taxiTripId])`

---

## TaxiLocation

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `taxiTripId` | `String` | — |  |
| `latitude` | `Float` | — |  |
| `longitude` | `Float` | — |  |
| `heading` | `Float?` | — | direction en degrés (0-360) |
| `speed` | `Float?` | — | km/h |
| `accuracy` | `Float?` | — | précision GPS en mètres |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `taxiTrip` → `TaxiTrip`

**Indexes :**
- `([taxiTripId])`
- `([createdAt])`

---

## Invoice

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String?` | UNIQUE |  |
| `clientId` | `String` | — |  |
| `invoiceNumber` | `String` | UNIQUE |  |
| `amount` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `paidAmount` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` | Calculé = SUM(payments.amount), mis à jour par allocatePayments() |
| `status` | `String` | default=`"PENDING"` | "PENDING" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" |
| `serviceType` | `String?` | — | "BOARDING" | "PET_TAXI" | "GROOMING" | "PRODUCT_SALE" | null (legacy) |
| `pdfUrl` | `String?` | — |  |
| `notes` | `String?` | — |  |
| `supplementaryForBookingId` | `String?` | — | set on extension-surcharge invoices (bookingId=null) — replaces fragile notes pattern |
| `clientDisplayName` | `String?` | — | overrides client.name on this invoice (Jordan / passage client) |
| `clientDisplayPhone` | `String?` | — | overrides client.phone on this invoice |
| `clientDisplayEmail` | `String?` | — | overrides client.email on this invoice |
| `periodDate` | `DateTime?` | — | = booking.startDate — used for revenue bucketing by month |
| `issuedAt` | `DateTime` | default=`now(` |  |
| `paidAt` | `DateTime?` | — |  |
| `version` | `Int` | default=`0` | optimistic concurrency lock |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `items` | `InvoiceItem[]` | — |  |
| `payments` | `Payment[]` | — |  |

**Relations**

- `client` → `User`
- `booking` → `Booking?`

**Indexes :**
- `([clientId])`
- `([status])`
- `([createdAt])`
- `([supplementaryForBookingId])`
- `([clientId, status]) // factures impayées par client`

---

## InvoiceItem

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `invoiceId` | `String` | — |  |
| `description` | `String` | — |  |
| `quantity` | `Int` | default=`1` |  |
| `unitPrice` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `total` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `allocatedAmount` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` | Montant alloué par allocatePayments() |
| `status` | `String` | default=`"PENDING"` | "PENDING" | "PARTIAL" | "PAID" |
| `category` | `ItemCategory` | default=`OTHER` |  |
| `productId` | `String?` | — |  |

**Relations**

- `invoice` → `Invoice`
- `product` → `Product?`

**Indexes :**
- `([invoiceId])`
- `([category]) // billing par catégorie (CA Taxi, Boarding…)`
- `([productId])`
- `([invoiceId, category]) // hot path : drill-down analytics + allocation séquentielle`

---

## Payment

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `invoiceId` | `String` | — |  |
| `amount` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `paymentMethod` | `String` | — | "CASH" | "CARD" | "CHECK" | "TRANSFER" |
| `paymentDate` | `DateTime` | — |  |
| `notes` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `invoice` → `Invoice`

**Indexes :**
- `([invoiceId])`
- `([paymentDate])`
- `([invoiceId, paymentDate])`
- `([paymentMethod]) // export factures filtré par méthode`

---

## Notification

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `userId` | `String` | — |  |
| `type` | `String` | — | "BOOKING_CONFIRMATION" | "BOOKING_VALIDATION" | "BOOKING_REFUSAL" | "STAY_REMINDER" | "INVOICE_AVAILABLE" | "ADMIN_MESSAGE" | "STAY_PHOTO" | "STAY_PHOTO_ADDED" | "LOYALTY_UPDATE" | "WEEKLY_PET_REPORT" |
| `titleFr` | `String` | — |  |
| `titleEn` | `String` | — |  |
| `titleAr` | `String?` | — | nullable: legacy rows pre-2026-05-05 have no AR translation (fallback to EN at render time) |
| `messageFr` | `String` | — |  |
| `messageEn` | `String` | — |  |
| `messageAr` | `String?` | — | nullable: same as titleAr |
| `metadata` | `String?` | — | JSON string e.g. {"bookingId":"..."} |
| `read` | `Boolean` | default=`false` |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `user` → `User`

**Indexes :**
- `([userId])`
- `([read])`
- `([createdAt])`
- `([userId, read]) // Hot path : compteur de notifications non lues`
- `([type, createdAt]) // Hot path : dedup batch par type sur fenêtre récente (cron reminders/birthday)`

---

## LoyaltyGrade

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `clientId` | `String` | UNIQUE |  |
| `grade` | `String` | default=`"BRONZE"` | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" |
| `isOverride` | `Boolean` | default=`false` |  |
| `overrideBy` | `String?` | — |  |
| `overrideAt` | `DateTime?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |

**Relations**

- `client` → `User`

---

## LoyaltyBenefitClaim

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `clientId` | `String` | — |  |
| `grade` | `String` | — | grade at time of claim |
| `benefitKey` | `String` | — | e.g. "grooming_discount_10", "free_grooming", "pet_taxi_ride" |
| `benefitLabelFr` | `String` | — |  |
| `benefitLabelEn` | `String` | — |  |
| `status` | `String` | default=`"PENDING"` | "PENDING" | "APPROVED" | "REJECTED" |
| `rejectionReason` | `String?` | — |  |
| `reviewedBy` | `String?` | — | admin user id |
| `reviewedAt` | `DateTime?` | — |  |
| `claimedAt` | `DateTime` | default=`now(` |  |

**Relations**

- `client` → `User`
- `reviewer` → `User?`

**Indexes :**
- `([clientId])`
- `([status])`
- `([clientId, status])`
- `([status, claimedAt])`

---

## AdminNote

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `entityType` | `String` | — | "CLIENT" | "PET" |
| `entityId` | `String` | — |  |
| `content` | `String` | — |  |
| `createdBy` | `String` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `author` → `User`

**Indexes :**
- `([entityType, entityId])`

---

## ActionLog

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `userId` | `String?` | — |  |
| `action` | `String` | — |  |
| `entityType` | `String?` | — |  |
| `entityId` | `String?` | — |  |
| `details` | `String?` | — | JSON string |
| `ipAddress` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `user` → `User?`

**Indexes :**
- `([createdAt])`
- `([userId])`

---

## Setting

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `key` | `String` | PK |  |
| `value` | `String` | — |  |
| `updatedAt` | `DateTime` | — |  |

---

## StayPhoto

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `url` | `String` | — |  |
| `caption` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([bookingId])`

---

## Review

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | UNIQUE |  |
| `clientId` | `String` | — |  |
| `rating` | `Int` | — | 1-5 |
| `comment` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `booking` → `Booking`
- `client` → `User`

**Indexes :**
- `([clientId])`
- `([createdAt])`

---

## RescheduleRequest

> the leftover tags manually until they age out.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | UNIQUE |  |
| `startDate` | `DateTime` | — |  |
| `endDate` | `DateTime?` | — |  |
| `reason` | `String?` | — |  |
| `status` | `String` | default=`"PENDING"` | PENDING | APPROVED | REJECTED |
| `createdAt` | `DateTime` | default=`now(` |  |
| `resolvedAt` | `DateTime?` | — |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([status])`
- `([createdAt])`

---

## AddonRequest

> they age out.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `petId` | `String?` | — |  |
| `serviceType` | `String` | — | 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE' | 'GROOMING' | 'TAXI_GO' | 'TAXI_RETURN' | 'PRODUCT' | 'OTHER' |
| `description` | `String` | — |  |
| `requestedBy` | `String` | — | userId of the client who made the request |
| `status` | `String` | default=`"PENDING"` | PENDING | APPROVED | REJECTED |
| `reason` | `String?` | — | rejection reason |
| `resolvedBy` | `String?` | — |  |
| `resolvedAt` | `DateTime?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([bookingId])`
- `([status])`
- `([requestedBy])`
- `([createdAt])`

---

## PasswordResetToken

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `userId` | `String` | — |  |
| `token` | `String` | UNIQUE |  |
| `expiresAt` | `DateTime` | — |  |
| `used` | `Boolean` | default=`false` |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `user` → `User`

**Indexes :**
- `([token])`

---

## ClientContract

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `clientId` | `String` | UNIQUE |  |
| `signedAt` | `DateTime` | default=`now(` |  |
| `pdfUrl` | `String?` | — | Deprecated: legacy public URL. Use storageKey + createSignedUrl() instead. |
| `storageKey` | `String` | — | e.g. contracts/{clientId}.pdf |
| `ipAddress` | `String?` | — |  |
| `version` | `String` | default=`"1.0"` |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Relations**

- `client` → `User`

---

## Product

> Stock décrémenté à la création d'un InvoiceItem produit.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `name` | `String` | — |  |
| `brand` | `String?` | — |  |
| `reference` | `String?` | — |  |
| `category` | `String?` | — |  |
| `price` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `stock` | `Int` | default=`0` |  |
| `available` | `Boolean` | default=`true` |  |
| `targetSpecies` | `String` | default=`"BOTH"` | 'DOG' | 'CAT' | 'BOTH' |
| `targetAge` | `String` | default=`"ALL"` | 'PUPPY' | 'JUNIOR' | 'ADULT' | 'SENIOR' | 'ALL' |
| `imageUrl` | `String?` | — |  |
| `weight` | `String?` | — |  |
| `supplier` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `invoiceItems` | `InvoiceItem[]` | — |  |

**Indexes :**
- `([available])`
- `([targetSpecies, targetAge, available], name: "Product_targeting_idx")`

---

## MonthlyRevenueSummary

> Independent from Booking/Invoice — never affects normal workflows.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `year` | `Int` | — |  |
| `month` | `Int` | — | 1–12 |
| `boardingRevenue` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `groomingRevenue` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `taxiRevenue` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `otherRevenue` | `Decimal` | default=`0` · `@db.Decimal(10, 2)` |  |
| `notes` | `String?` | — |  |
| `createdBy` | `String` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |

**Relations**

- `author` → `User`

**Uniques composites :** `([year, month])`

**Indexes :**
- `([year])`

---

## InvoiceSequence

> garantissant l'absence de race au sein d'une même année.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `year` | `Int` | PK |  |
| `lastSeq` | `Int` | default=`0` |  |

---

## GuardianEvent

> notifié, silenced…). Voir `src/lib/guardian/*` et `docs/GUARDIAN.md`.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `sentryEventId` | `String` | UNIQUE |  |
| `sentryIssueId` | `String?` | — |  |
| `projectSlug` | `String?` | — |  |
| `title` | `String` | — |  |
| `culprit` | `String?` | — |  |
| `level` | `String?` | — | 'fatal' | 'error' | 'warning' | 'info' | 'debug' |
| `classification` | `String` | — | 'transient' | 'bug_code' | 'data_corruption' | 'infra' | 'spam' | 'unclassified' |
| `severity` | `Int` | — | 1..5 |
| `action` | `String` | — | 'github_issue' | 'notify_admin' | 'silence' | 'unclassified' |
| `reason` | `String?` | — | courte explication produite par le classifier (ou message d'erreur) |
| `githubIssueUrl` | `String?` | — |  |
| `occurrencesSeen` | `Int` | default=`1` |  |
| `createdAt` | `DateTime` | default=`now(` |  |

**Indexes :**
- `([createdAt])`
- `([classification])`

---

## Heartbeat

> la latence DB.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `timestamp` | `DateTime` | default=`now(` |  |
| `status` | `String` | — | "ok" | "degraded" | "down" |
| `latencyMs` | `Int` | — |  |
| `dbStatus` | `String` | — | "ok" | "down" |
| `redisStatus` | `String` | — | "ok" | "down" |

**Indexes :**
- `([timestamp(sort: Desc)])`

---

## FeatureFlag

> Lecture cachée Redis 60s ; fail-open : Redis down → DB ; DB down → false.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `key` | `String` | PK |  |
| `description` | `String` | default=`""` |  |
| `enabled` | `Boolean` | default=`false` | kill-switch global |
| `rolloutPercent` | `Int` | default=`0` | 0-100, sticky bucketing par hash(userId+key) |
| `targetRoles` | `String[]` | default=`[]` | ['CLIENT','ADMIN','SUPERADMIN'] ; [] = pas de filtre |
| `userWhitelist` | `String[]` | default=`[]` | userIds explicites (bypass rollout) |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |

---

## Enums

### enum ItemCategory

- `BOARDING`
- `PET_TAXI`
- `GROOMING`
- `PRODUCT`
- `OTHER`
- `DISCOUNT`
