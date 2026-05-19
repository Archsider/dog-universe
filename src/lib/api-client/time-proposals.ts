// Typed client for POST /api/admin/bookings/[id]/time-proposals.

import { apiPost, type ApiResult } from './fetcher';
import {
  timeProposalBodySchema,
  type TimeProposalBody,
  type TimeProposalSuccess,
  type TimeProposalErrorCode,
} from '../api-schemas/time-proposals';

export async function submitTimeProposal(
  bookingId: string,
  body: TimeProposalBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<TimeProposalSuccess, TimeProposalErrorCode>> {
  return apiPost<typeof timeProposalBodySchema, TimeProposalSuccess, TimeProposalErrorCode>(
    `/api/admin/bookings/${encodeURIComponent(bookingId)}/time-proposals`,
    timeProposalBodySchema,
    body,
    { signal: options.signal },
  );
}
