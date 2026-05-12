import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingActions from './BookingActions';

// Mock next/navigation
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE_PROPS = {
  bookingId: 'bk1',
  version: 0,
  locale: 'fr',
  invoiceId: null,
  onStatusChange: vi.fn(),
  onCloseStay: vi.fn(),
};

describe('BookingActions', () => {
  it('PENDING boarding: shows Refuser and Confirmer', () => {
    render(<BookingActions {...BASE_PROPS} status="PENDING" serviceType="BOARDING" />);
    expect(screen.getByText('Refuser')).toBeTruthy();
    expect(screen.getByText('Confirmer le séjour')).toBeTruthy();
  });

  it('CONFIRMED boarding: shows "Marquer" action', () => {
    render(<BookingActions {...BASE_PROPS} status="CONFIRMED" serviceType="BOARDING" />);
    expect(screen.queryByText('Refuser')).toBeNull();
    expect(screen.getByText(/Marquer/)).toBeTruthy();
  });

  it('IN_PROGRESS boarding: shows "Clôturer" button and calls onCloseStay', async () => {
    const onCloseStay = vi.fn();
    render(
      <BookingActions
        {...BASE_PROPS}
        status="IN_PROGRESS"
        serviceType="BOARDING"
        onCloseStay={onCloseStay}
      />,
    );
    const btn = screen.getByText('Clôturer le séjour');
    await userEvent.click(btn);
    expect(onCloseStay).toHaveBeenCalledTimes(1);
  });

  it('COMPLETED boarding: renders nothing (no primary action)', () => {
    const { container } = render(
      <BookingActions {...BASE_PROPS} status="COMPLETED" serviceType="BOARDING" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('PENDING taxi: shows "Confirmer le transport"', () => {
    render(<BookingActions {...BASE_PROPS} status="PENDING" serviceType="PET_TAXI" />);
    expect(screen.getByText('Confirmer le transport')).toBeTruthy();
  });

  it('reject flow: textarea appears after clicking Refuser', async () => {
    render(<BookingActions {...BASE_PROPS} status="PENDING" serviceType="BOARDING" />);
    await userEvent.click(screen.getByText('Refuser'));
    expect(screen.getByPlaceholderText(/Raison/)).toBeTruthy();
  });

  it('reject confirm disabled with < 10 chars', async () => {
    render(<BookingActions {...BASE_PROPS} status="PENDING" serviceType="BOARDING" />);
    await userEvent.click(screen.getByText('Refuser'));
    const textarea = screen.getByPlaceholderText(/Raison/);
    await userEvent.type(textarea, 'short');
    const confirmBtn = screen.getByText('Confirmer le refus');
    expect(confirmBtn.closest('button')?.disabled).toBe(true);
  });
});
