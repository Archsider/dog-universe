// Shared types for the booking detail side panel.
// No Prisma imports — serialisation-safe (all dates as ISO strings).

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW'
  | 'WAITLIST'
  | 'PENDING_EXTENSION';

export type ServiceType = 'BOARDING' | 'PET_TAXI';
export type Species = 'DOG' | 'CAT';
export type InvoiceStatus = 'PENDING' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED';

export interface BookingDetailPet {
  id: string;
  name: string;
  species: Species;
  breed: string | null;
  photoUrl: string | null;
  gender: string | null;
  allergies: string | null;
  currentMedication: string | null;
  behaviorWithDogs: string | null;
  behaviorWithCats: string | null;
  notes: string | null;
}

export interface BookingDetailInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  amount: number;
  paidAmount: number;
  version: number;
}

export interface BookingDetailClient {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  isWalkIn: boolean;
}

export interface BookingDetail {
  id: string;
  status: BookingStatus;
  serviceType: ServiceType;
  startDate: string;       // ISO
  endDate: string | null;  // ISO
  isOpenEnded: boolean;
  totalPrice: number;
  notes: string | null;
  cancellationReason: string | null;
  arrivalTime: string | null;
  version: number;
  createdAt: string;       // ISO

  client: BookingDetailClient;
  pets: BookingDetailPet[];

  invoice: BookingDetailInvoice | null;
  supplementaryInvoice: BookingDetailInvoice | null;

  // Boarding detail
  boarding: {
    groomingEnabled: boolean;
    groomingPrice: number | null;
    taxiGoEnabled: boolean;
    taxiReturnEnabled: boolean;
    pricePerNight: number | null;
  } | null;

  // Taxi detail
  taxi: {
    pickupAddress: string | null;
    dropoffAddress: string | null;
    price: number | null;
  } | null;

  // Admin notes (if any admin message)
  adminNotes: string | null;

  // Action log entries (most recent 20)
  actionLog: {
    id: string;
    action: string;
    details: string | null;
    createdAt: string;
    userName: string | null;
  }[];

  // Computed live total for open-ended stays
  liveTotal: number | null;
  liveNights: number | null;
}
