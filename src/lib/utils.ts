import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMAD(amount: number): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' MAD';
}

export function formatDate(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateFnsLocale = locale === 'fr' ? fr : enUS;
  return format(d, 'PPP', { locale: dateFnsLocale });
}

export function formatDateShort(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, locale === 'fr' ? 'dd/MM/yyyy' : 'MM/dd/yyyy');
}

export function formatRelativeTime(date: Date | string, locale: string = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateFnsLocale = locale === 'fr' ? fr : enUS;
  return formatDistanceToNow(d, { addSuffix: true, locale: dateFnsLocale });
}

export function calculateNights(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  return Math.max(0, differenceInDays(end, start));
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function calculateAge(dateOfBirth: Date | string, locale: string = 'fr'): string {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const years = Math.floor(differenceInDays(new Date(), dob) / 365);
  if (locale === 'en') return `${years} year${years > 1 ? 's' : ''}`;
  return `${years} an${years > 1 ? 's' : ''}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '…';
}

export function generateInvoiceNumber(counter: number): string {
  const year = new Date().getFullYear();
  return `DU-${year}-${String(counter).padStart(4, '0')}`;
}

export function getLoyaltyGradeColor(grade: string): string {
  switch (grade) {
    case 'BRONZE': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'SILVER': return 'text-slate-600 bg-slate-50 border-slate-200';
    case 'GOLD': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'PLATINUM': return 'text-indigo-700 bg-indigo-50 border-indigo-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function getLoyaltyGradeLabel(grade: string, locale: string = 'fr'): string {
  const labels: Record<string, Record<string, string>> = {
    fr: { BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine' },
    en: { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum' },
  };
  return labels[locale]?.[grade] ?? grade;
}

export function getBookingStatusColor(status: string): string {
  switch (status) {
    case 'PENDING': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'CONFIRMED': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'COMPLETED': return 'text-green-700 bg-green-50 border-green-200';
    case 'CANCELLED': return 'text-red-700 bg-red-50 border-red-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function getInvoiceStatusColor(status: string): string {
  switch (status) {
    case 'PAID': return 'text-green-700 bg-green-50 border-green-200';
    case 'PENDING': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}
