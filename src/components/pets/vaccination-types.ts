export interface Vaccination {
  id: string;
  vaccineType: string;
  date: Date | string | null;
  nextDueDate?: Date | string | null;
  comment: string | null;
  status: string; // "CONFIRMED" | "DRAFT"
  isAutoDetected: boolean;
  sourceDocumentId?: string | null;
  _extractionConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  _extractionNote?: string | null;
}

export interface PetDocument {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date | string;
}

export interface DraftForm {
  vaccineType: string;
  date: string;
  nextDueDate: string;
  comment: string;
}

export interface VaccinationLabels {
  title: string;
  add: string;
  addTitle: string;
  vaccineType: string;
  date: string;
  nextDueDate: string;
  comment: string;
  save: string;
  cancel: string;
  saving: string;
  typePlaceholder: string;
  commentPlaceholder: string;
  nextDuePlaceholder: string;
  emptyTitle: string;
  emptyHint: string;
  proofReceivedTitle: string;
  proofReceivedHint: string;
  proofUnanalyzedHint: (n: number) => string;
  analyzeBtn: string;
  analyzing: string;
  draftBadge: string;
  draftDetectedBadge: string;
  draftTitle: string;
  draftHint: string;
  draftHintManual: string;
  confirmBtn: string;
  ignoreBtn: string;
  confirming: string;
  confidenceHigh: string;
  confidenceMedium: string;
  confidenceLow: string;
  proofTitle: string;
  proofSubtitle: string;
  proofUpload: string;
  proofUploading: string;
  proofHint: string;
  proofEmpty: string;
  proofView: string;
  proofDelete: string;
  proofConfirmDelete: string;
  confirmDeleteVax: string;
  confirmDeleteDraft: string;
  fieldRequired: string;
}
