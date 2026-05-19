// Shared schema + types for POST /api/admin/bookings/[id]/time-proposals.
// Discriminated union on `action`: propose / accept / reject.

import { z } from 'zod';

export const TIME_PROPOSAL_SCOPES = ['ARRIVAL', 'TAXI_GO', 'TAXI_RETURN'] as const;
export type TimeProposalScope = (typeof TIME_PROPOSAL_SCOPES)[number];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const timeProposalBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('propose'),
    scope: z.enum(TIME_PROPOSAL_SCOPES),
    time: z.string().regex(TIME_RE, 'time must be HH:MM 24h'),
    note: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal('accept'),
    proposalId: z.string().min(1).max(64),
    note: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal('reject'),
    proposalId: z.string().min(1).max(64),
    note: z.string().trim().min(10, 'rejection note ≥ 10 chars required').max(500),
  }),
]);

export type TimeProposalBody = z.infer<typeof timeProposalBodySchema>;

// Per-action success shapes — caller knows which to expect from the action
// passed in the request.
export interface ProposeSuccess {
  ok: true;
  proposalId: string;
  publicToken?: string;
  publicTokenExpiresAt?: string;
}

export interface AcceptSuccess {
  ok: true;
}

export interface RejectSuccess {
  ok: true;
}

export type TimeProposalSuccess = ProposeSuccess | AcceptSuccess | RejectSuccess;

export type TimeProposalErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'BOOKING_NOT_FOUND'
  | 'PROPOSAL_NOT_FOUND'
  | 'CROSS_ROLE_FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
