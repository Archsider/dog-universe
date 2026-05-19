# SCHEMA.md — Référence base de données

> Généré automatiquement depuis `prisma/schema.prisma`. Ne pas éditer à la main.
> Régénérer avec `node scripts/generate-schema-doc.mjs` (ou `npm run db:doc`).

**40 modèles** · **8 enums** · 2026-05-19

## Sommaire

- [User](#user)
- [Pet](#pet)
- [PetWeightEntry](#petweightentry)
- [Vaccination](#vaccination)
- [PetDocument](#petdocument)
- [Booking](#booking)
- [TimeProposal](#timeproposal)
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
- [EndStayReport](#endstayreport)
- [DailyReport](#dailyreport)
- [RescheduleRequest](#reschedulerequest)
- [AddonRequest](#addonrequest)
- [PasswordResetToken](#passwordresettoken)
- [ClientContract](#clientcontract)
- [LifetimeContract](#lifetimecontract)
- [Product](#product)
- [ProductCatalogSuggestion](#productcatalogsuggestion)
- [MonthlyRevenueSummary](#monthlyrevenuesummary)
- [InvoiceSequence](#invoicesequence)
- [GuardianEvent](#guardianevent)
- [Heartbeat](#heartbeat)
- [FeatureFlag](#featureflag)
- [SmsLog](#smslog)

### Enums
- [TimeProposalScope](#enum-timeproposalscope)
- [TimeProposalStatus](#enum-timeproposalstatus)
- [BookingStatus](#enum-bookingstatus)
- [BookingServiceType](#enum-bookingservicetype)
- [PaymentMethod](#enum-paymentmethod)
- [InvoiceStatus](#enum-invoicestatus)
- [ItemCategory](#enum-itemcategory)
- [LifetimeContractStatus](#enum-lifetimecontractstatus)

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
| `lifetimeContracts` | `LifetimeContract[]` | — |  |

**Relations**

- `adminNotes` → `AdminNote[]`
- `reviewedClaims` → `LoyaltyBenefitClaim[]`
- `endStayReportsReceived` → `EndStayReport[]`
- `endStayReportsSent` → `EndStayReport[]`

**Indexes :**
- `([deletedAt])`
- `([role, isWalkIn]) // Hot path: admin pages filter by role='CLIENT' AND isWalkIn=false`

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
| `isPermanentResident` | `Boolean` | default=`false` |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `deletedAt` | `DateTime?` | — | Soft-delete — null = active, non-null = archived |
| `vaccinations` | `Vaccination[]` | — |  |
| `documents` | `PetDocument[]` | — |  |
| `bookingPets` | `BookingPet[]` | — |  |
| `weightEntries` | `PetWeightEntry[]` | — |  |
| `lifetimeContracts` | `LifetimeContract[]` | — |  |
| `dailyReports` | `DailyReport[]` | — |  |

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
| `serviceType` | `BookingServiceType` | — | "BOARDING" | "PET_TAXI" |
| `status` | `BookingStatus` | default=`PENDING` | "PENDING" | "CONFIRMED" | "AT_PICKUP" | "IN_PROGRESS" | "CANCELLED" | "REJECTED" | "COMPLETED" | "NO_SHOW" | "WAITLIST" | "PENDING_EXTENSION" |
| `startDate` | `DateTime` | — |  |
| `endDate` | `DateTime?` | — |  |
| `isOpenEnded` | `Boolean` | default=`false` | séjour à durée indéterminée — endDate fixé au checkout |
| `isWalkIn` | `Boolean` | default=`false` | saisie admin walk-in — indépendant de User.isWalkIn (client peut rejoindre le portail plus tard) |
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
| `endStayReports` | `EndStayReport[]` | — |  |
| `timeProposals` | `TimeProposal[]` | — |  |
| `dailyReports` | `DailyReport[]` | — |  |

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
- `([status, endDate]) // Hot path : cron reminders end + capacity overlap`
- `([isWalkIn]) // Walk-in filter on Today view + billing exclusions`

---

## TimeProposal

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `scope` | `TimeProposalScope` | — |  |
| `time` | `String` | — | "HH:MM" canonical 24h Casa |
| `status` | `TimeProposalStatus` | default=`PENDING` |  |
| `proposedBy` | `String` | — | userId of the proposer |
| `proposedByRole` | `String` | — | 'CLIENT' | 'ADMIN' | 'SUPERADMIN' |
| `proposedAt` | `DateTime` | default=`now(` |  |
| `proposalNote` | `String?` | — | short free-text (FR/EN) shown to receiver |
| `respondedBy` | `String?` | — |  |
| `respondedByRole` | `String?` | — | 'CLIENT' | 'ADMIN' | 'SUPERADMIN' |
| `respondedAt` | `DateTime?` | — |  |
| `responseNote` | `String?` | — | rejection reason / counter-proposal note |
| `publicToken` | `String?` | UNIQUE |  |
| `publicTokenExpiresAt` | `DateTime?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |

**Relations**

- `booking` → `Booking`

**Indexes :**
- `([bookingId, scope])`
- `([bookingId, scope, status]) // Hot path : getConfirmedTime, getCurrentProposal`
- `([status]) // List PENDING for admin alerts`
- `([publicToken]) // Email link lookup`

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
| `productId` | `String?` | — | optional link to Product catalogue (decrement stock on add/restore on delete) |
| `invoiceItemId` | `String?` | — | set once the line has been billed (main or supplementary invoice) |
| `description` | `String` | — |  |
| `quantity` | `Int` | default=`1` |  |
| `unitPrice` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `total` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `category` | `ItemCategory` | default=`OTHER` |  |
| `version` | `Int` | default=`0` | H9 — optimistic lock against concurrent product mutations |

**Relations**

- `booking` → `Booking`
- `product` → `Product?`
- `invoiceItem` → `InvoiceItem?`

**Indexes :**
- `([bookingId])`
- `([productId])`
- `([invoiceItemId])`

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
| `status` | `InvoiceStatus` | default=`PENDING` | "PENDING" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" |
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
| `bookingItems` | `BookingItem[]` | — | BookingItem rows billed into this InvoiceItem (supplementary flow) |

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
| `paymentMethod` | `PaymentMethod` | — | "CASH" | "CARD" | "CHECK" | "TRANSFER" |
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
| `type` | `String` | — | "BOOKING_CONFIRMATION" | "BOOKING_VALIDATION" | "BOOKING_REFUSAL" | "STAY_REMINDER" | "INVOICE_AVAILABLE" | "ADMIN_MESSAGE" | "STAY_PHOTO" | "STAY_PHOTO_ADDED" | "LOYALTY_UPDATE" | "WEEKLY_PET_REPORT" | "END_STAY_REPORT" |
| `titleFr` | `String` | — |  |
| `titleEn` | `String` | — |  |
| `titleAr` | `String?` | — | nullable: legacy rows pre-2026-05-05 have no AR translation (fallback to EN at render time) |
| `messageFr` | `String` | — |  |
| `messageEn` | `String` | — |  |
| `messageAr` | `String?` | — | nullable: same as titleAr |
| `metadata` | `String?` | — | JSON string e.g. {"bookingId":"..."} |
| `read` | `Boolean` | default=`false` |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `deletedAt` | `DateTime?` | — |  |
| `deletedBy` | `String?` | — |  |

**Relations**

- `user` → `User`

**Indexes :**
- `([userId])`
- `([read])`
- `([createdAt])`
- `([userId, read]) // Hot path : compteur de notifications non lues`
- `([type, createdAt]) // Hot path : dedup batch par type sur fenêtre récente (cron reminders/birthday)`
- `([deletedAt]) // soft-delete filter on client + admin queries`
- `([userId, type, createdAt(sort: Desc)], name: "Notification_user_type_date_idx") // Hot path : cron per-user dedup (reminders, overdue, review-requests…)`

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
| `version` | `Int` | default=`0` | H8 — optimistic lock (admin override vs auto-recompute race) |
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
- `([entityType, entityId, createdAt(sort: Desc)], name: "ActionLog_entity_createdAt_idx") // Hot path : slide-over panel History section`

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

## EndStayReport

> second send unless the operator explicitly chooses "Renvoyer".

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `clientId` | `String` | — |  |
| `formData` | `String` | — | JSON: { sections: [{key, checked: [], freeText}], closingNote } |
| `finalMessage` | `String` | — | The exact text body sent in the Notification.messageFr |
| `sentAt` | `DateTime` | default=`now(` |  |
| `sentBy` | `String` | — | userId of the admin who clicked send |
| `version` | `Int` | default=`1` | 1 = manual template ; 2+ reserved for AI workflow |

**Relations**

- `booking` → `Booking`
- `client` → `User`
- `sender` → `User`

**Indexes :**
- `([bookingId])`
- `([clientId])`
- `([sentAt])`

---

## DailyReport

> Source : audit features 2026-05-19 (Feature #3 — Daily Report Card).

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `bookingId` | `String` | — |  |
| `petId` | `String` | — |  |
| `date` | `String` | — |  |
| `photoUrls` | `String[]` | default=`[]` | 1–3 public URLs returned by uploadBuffer |
| `moodEmoji` | `String?` | — |  |
| `foodEmoji` | `String?` | — |  |
| `sleepEmoji` | `String?` | — |  |
| `playEmoji` | `String?` | — |  |
| `note` | `String?` | — | ≤ 280 chars — one short personal sentence |
| `status` | `String` | default=`"DRAFT"` | DRAFT | SENT | SKIPPED |
| `sentAt` | `DateTime?` | — |  |
| `sentBy` | `String?` | — | userId of the admin who clicked Send |
| `skipReason` | `String?` | — |  |
| `emailFailed` | `Boolean` | default=`false` | surfaced in admin UI for retry |
| `createdAt` | `DateTime` | default=`now(` |  |
| `createdBy` | `String` | — | userId — cron-system for auto-created drafts, admin id for manual |
| `updatedAt` | `DateTime` | — |  |

**Relations**

- `booking` → `Booking`
- `pet` → `Pet`

**Uniques composites :** `([petId, date])`

**Indexes :**
- `([bookingId])`
- `([status, date])`
- `([date])`

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

## LifetimeContract

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `clientId` | `String` | — |  |
| `petId` | `String` | — |  |
| `status` | `LifetimeContractStatus` | default=`PENDING` |  |
| `publicToken` | `String?` | UNIQUE |  |
| `publicTokenExpiresAt` | `DateTime?` | — |  |
| `signedAt` | `DateTime?` | — |  |
| `storageKey` | `String?` | — | e.g. contracts-lifetime/{id}.pdf in `uploads-private` |
| `ipAddress` | `String?` | — |  |
| `userAgent` | `String?` | — |  |
| `version` | `String` | default=`"1.0"` |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `createdBy` | `String` | — | userId of admin who generated the link |
| `updatedAt` | `DateTime` | — |  |

**Relations**

- `client` → `User`
- `pet` → `Pet`

**Indexes :**
- `([clientId])`
- `([petId])`
- `([status])`
- `([publicToken])`

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
| `description` | `String?` | — |  |
| `price` | `Decimal` | `@db.Decimal(10, 2)` |  |
| `costPrice` | `Decimal?` | `@db.Decimal(10, 2)` |  |
| `stock` | `Int` | default=`0` |  |
| `lowStockThreshold` | `Int?` | — |  |
| `available` | `Boolean` | default=`true` |  |
| `isArchived` | `Boolean` | default=`false` |  |
| `version` | `Int` | default=`0` |  |
| `targetSpecies` | `String` | default=`"BOTH"` | 'DOG' | 'CAT' | 'BOTH' |
| `targetAge` | `String` | default=`"ALL"` | 'PUPPY' | 'JUNIOR' | 'ADULT' | 'SENIOR' | 'ALL' |
| `imageUrl` | `String?` | — |  |
| `weight` | `String?` | — |  |
| `supplier` | `String?` | — |  |
| `createdAt` | `DateTime` | default=`now(` |  |
| `updatedAt` | `DateTime` | — |  |
| `invoiceItems` | `InvoiceItem[]` | — |  |
| `bookingItems` | `BookingItem[]` | — |  |
| `catalogSuggestions` | `ProductCatalogSuggestion[]` | — |  |

**Indexes :**
- `([available])`
- `([isArchived])`
- `([targetSpecies, targetAge, available], name: "Product_targeting_idx")`

---

## ProductCatalogSuggestion

> See section "PRODUCT CATALOG INTELLIGENCE" in CLAUDE.md.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `invoiceItemId` | `String` | UNIQUE |  |
| `suggestedProductId` | `String` | — |  |
| `confidence` | `Float` | — | 0..1 — fuzzy match score (≥0.8 required for insert) |
| `matchedTokens` | `String[]` | default=`[]` | words that matched (for UI explainability) |
| `status` | `String` | default=`"pending"` | 'pending' | 'accepted' | 'rejected' |
| `createdAt` | `DateTime` | default=`now(` |  |
| `respondedAt` | `DateTime?` | — |  |
| `respondedBy` | `String?` | — | userId of the admin who accepted/rejected |

**Relations**

- `suggestedProduct` → `Product`

**Indexes :**
- `([status, createdAt])`
- `([suggestedProductId])`

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

## SmsLog

> never deliver the same SMS twice within the 24h dedup window.

| Champ | Type | Attributs | Commentaire |
|---|---|---|---|
| `id` | `String` | PK · default=`cuid(` |  |
| `phone` | `String` | — | phone number or 'ADMIN' |
| `contentHash` | `String` | — | SHA-256(phone + '\x00' + message) |
| `sentAt` | `DateTime` | default=`now(` |  |
| `status` | `String` | default=`"SENT"` | SENT | FAILED | SKIPPED |
| `bookingId` | `String?` | — |  |

**Uniques composites :** `([phone, contentHash])`

**Indexes :**
- `([phone, sentAt])`
- `([sentAt])`

---

## Enums

### enum TimeProposalScope

- `ARRIVAL // Booking arrival time`
- `TAXI_GO // BoardingDetail.taxiGoTime`
- `TAXI_RETURN // BoardingDetail.taxiReturnTime`

### enum TimeProposalStatus

- `PENDING // awaiting response from the other party`
- `ACCEPTED // confirmed time — source of truth`
- `REJECTED // refused with a reason ; admin must propose a new one`
- `SUPERSEDED // newer proposal replaced this one (audit history)`
- `CANCELLED // proposer withdrew before any response`

### enum BookingStatus

- `PENDING`
- `CONFIRMED`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`
- `REJECTED`
- `AT_PICKUP`
- `NO_SHOW`
- `WAITLIST`
- `PENDING_EXTENSION`

### enum BookingServiceType

- `BOARDING`
- `PET_TAXI`

### enum PaymentMethod

- `CASH`
- `CARD`
- `CHECK`
- `TRANSFER`

### enum InvoiceStatus

- `PENDING`
- `PAID`
- `CANCELLED`
- `PARTIALLY_PAID`

### enum ItemCategory

- `BOARDING`
- `PET_TAXI`
- `GROOMING`
- `PRODUCT`
- `OTHER`
- `DISCOUNT`
- `EXTRA_SERVICE`
- `MISC_FEE`

### enum LifetimeContractStatus

- `PENDING`
- `SIGNED`
- `EXPIRED`
- `REVOKED`
