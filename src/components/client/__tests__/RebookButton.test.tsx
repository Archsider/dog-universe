import { describe, it, expect } from 'vitest';
import { RebookButton } from '@/components/client/RebookButton';

// Server Component → call it as a plain function and inspect the returned
// React element tree. No DOM needed.

const booking = {
  id: 'b1',
  serviceType: 'BOARDING' as const,
  bookingPets: [{ pet: { id: 'p1', name: 'Max' } }, { pet: { id: 'p2', name: 'Luna' } }],
  totalPrice: 500,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('RebookButton', () => {
  it('compact variant links to the prefilled wizard (petIds + serviceType + prefill)', () => {
    const el = RebookButton({ booking, locale: 'fr', variant: 'compact' }) as any;
    expect(el.props.href).toBe('/fr/client/bookings/new?petIds=p1%2Cp2&serviceType=BOARDING&prefill=1');
  });

  it('card variant (default) wraps the same prefill href + a subtext', () => {
    const el = RebookButton({ booking, locale: 'en' }) as any;
    const link = el.props.children[0];
    expect(link.props.href).toContain('petIds=p1%2Cp2');
    expect(link.props.href).toContain('serviceType=BOARDING');
    expect(link.props.href).toContain('prefill=1');
  });

  it('encodes a single pet id correctly', () => {
    const el = RebookButton({
      booking: { ...booking, bookingPets: [{ pet: { id: 'solo', name: 'Rex' } }] },
      locale: 'fr',
      variant: 'compact',
    }) as any;
    expect(el.props.href).toBe('/fr/client/bookings/new?petIds=solo&serviceType=BOARDING&prefill=1');
  });
});
