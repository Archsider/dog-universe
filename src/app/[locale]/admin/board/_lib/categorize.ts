import type { BookingCard } from './types';

// Categorize bookings into 4 kanban columns
export function categorize(bookings: BookingCard[], serviceType: 'BOARDING' | 'PET_TAXI') {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const filtered = bookings.filter((b) => b.serviceType === serviceType);

  const pending: BookingCard[] = [];
  const confirmed: BookingCard[] = [];
  const inProgress: BookingCard[] = [];
  const completed: BookingCard[] = [];

  for (const b of filtered) {
    if (b.status === 'PENDING') { pending.push(b); continue; }
    if (b.status === 'COMPLETED') { completed.push(b); continue; }
    // CONFIRMED or IN_PROGRESS
    const start = new Date(b.startDate);
    const end = b.endDate ? new Date(b.endDate) : null;
    const started = start <= now;
    const notEnded = !end || end >= todayStart;
    if (started && notEnded) {
      inProgress.push(b);
    } else {
      confirmed.push(b);
    }
  }

  return { pending, confirmed, inProgress, completed };
}
