import { NextResponse } from 'next/server';

// Deprecated — replaced by PATCH /api/admin/taxi-trips/[id]/status
// The taxiGoStatus/taxiReturnStatus columns have been removed from BoardingDetail.
export async function PATCH() {
  return NextResponse.json(
    { error: 'Deprecated. Use PATCH /api/admin/taxi-trips/{taxiTripId}/status' },
    { status: 410 },
  );
}
