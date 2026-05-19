import { describe, it, expect } from 'vitest';
import { timeProposalBodySchema, TIME_PROPOSAL_SCOPES } from '../time-proposals';

describe('timeProposalBodySchema — propose action', () => {
  it('accepts a valid propose body', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'propose',
      scope: 'ARRIVAL',
      time: '14:30',
    });
    expect(r.success).toBe(true);
  });

  it('accepts all 3 scopes', () => {
    for (const scope of TIME_PROPOSAL_SCOPES) {
      const r = timeProposalBodySchema.safeParse({
        action: 'propose',
        scope,
        time: '10:00',
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejects unknown scope', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'propose',
      scope: 'CHECK_IN',
      time: '14:30',
    });
    expect(r.success).toBe(false);
  });

  it('rejects malformed time (must be HH:MM 24h)', () => {
    for (const bad of ['25:00', '14:60', '2:30', '14h30', '1430', 'noon']) {
      const r = timeProposalBodySchema.safeParse({
        action: 'propose',
        scope: 'ARRIVAL',
        time: bad,
      });
      expect(r.success).toBe(false);
    }
  });

  it('accepts edge times 00:00 and 23:59', () => {
    for (const t of ['00:00', '23:59']) {
      const r = timeProposalBodySchema.safeParse({
        action: 'propose',
        scope: 'ARRIVAL',
        time: t,
      });
      expect(r.success).toBe(true);
    }
  });

  it('accepts optional note', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'propose',
      scope: 'TAXI_GO',
      time: '11:00',
      note: 'Le client préfère le matin',
    });
    expect(r.success).toBe(true);
  });
});

describe('timeProposalBodySchema — accept action', () => {
  it('accepts a valid accept body', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'accept',
      proposalId: 'tp_abc123',
    });
    expect(r.success).toBe(true);
  });

  it('accept does NOT require note', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'accept',
      proposalId: 'tp_abc',
    });
    expect(r.success).toBe(true);
  });
});

describe('timeProposalBodySchema — reject action', () => {
  it('rejects without note (min 10 chars required)', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'reject',
      proposalId: 'tp_abc',
    });
    expect(r.success).toBe(false);
  });

  it('rejects with note < 10 chars', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'reject',
      proposalId: 'tp_abc',
      note: 'court',
    });
    expect(r.success).toBe(false);
  });

  it('accepts with valid note ≥ 10 chars', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'reject',
      proposalId: 'tp_abc',
      note: 'Cette heure ne convient pas, trop tôt',
    });
    expect(r.success).toBe(true);
  });
});

describe('timeProposalBodySchema — discrimination', () => {
  it('rejects unknown action', () => {
    const r = timeProposalBodySchema.safeParse({
      action: 'cancel',
      proposalId: 'tp_abc',
    });
    expect(r.success).toBe(false);
  });

  it('exposes the canonical scope list', () => {
    expect(TIME_PROPOSAL_SCOPES).toEqual(['ARRIVAL', 'TAXI_GO', 'TAXI_RETURN']);
  });
});
