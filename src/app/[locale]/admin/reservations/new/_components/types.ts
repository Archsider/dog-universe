// Shared types + the translation dictionary slice for the New Booking
// form sub-components. Centralised here so each section file imports the
// same shape without duplicating the type list.

export type Species = 'DOG' | 'CAT';

export type PetLite = {
  id: string;
  name: string;
  species: Species;
  dateOfBirth: string | null;
};

export type ClientLite = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pets: PetLite[];
};

export type WalkInPet = {
  name: string;
  species: Species;
  dateOfBirth: string;
  breed: string;
};

export type InitialStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';

// We pass the entire FR/EN translation slice as a `t` prop. Sub-components
// only consume the keys they actually use, but typing it as the full dict
// keeps the parent and children in sync at compile time.
export type Translations = {
  clientSection: string;
  selectClient: string;
  search: string;
  walkInToggle: string;
  walkInName: string;
  walkInPhone: string;
  walkInEmail: string;
  petsSection: string;
  addPet: string;
  petName: string;
  species: string;
  dog: string;
  cat: string;
  dob: string;
  breed: string;
  addPetForClient: string;
  confirmAddPet: string;
  addingPet: string;
  petAddedSuccess: string;
  dobRequiredLabel: string;
  dobRequiredPet: string;
  petNameRequiredMsg: string;
  serviceSection: string;
  boarding: string;
  taxi: string;
  datesSection: string;
  startDate: string;
  endDate: string;
  arrivalTime: string;
  openEndedToggle: string;
  openEndedNote: string;
  statusSection: string;
  statusHelp: string;
  statusPending: string;
  statusConfirmed: string;
  statusInProgress: string;
  statusCompleted: string;
  retroAmountSection: string;
  retroAmount: string;
  retroAmountHelp: string;
  taxiMismatchWarning: string;
  priceSection: string;
  totalPrice: string;
  suggested: string;
  invoiceSection: string;
  createInvoice: string;
  notesSection: string;
  submit: string;
  submitting: string;
  cancel: string;
  noPets: string;
  sundayInvalid: string;
  timeInvalid: string;
  walkInPetsRequired: string;
  petsRequired: string;
  retroAmountRequired: string;
  error: string;
  success: string;
  capacity: string;
};
