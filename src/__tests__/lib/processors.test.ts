/**
 * Unit tests — src/workers/processors.ts
 *
 * Tests processEmailJob and processSmsJob with mocked sendEmail / sendSMS / sendAdminSMS.
 * Zod validation errors are also tested (invalid payloads must throw so BullMQ can retry → DLQ).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendSMS: vi.fn().mockResolvedValue(undefined),
  sendAdminSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
}));

// Import AFTER mocks
import { processEmailJob, processSmsJob } from '@/workers/processors';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';

// ---------------------------------------------------------------------------
// Helpers — create minimal BullMQ-like Job objects
// ---------------------------------------------------------------------------
function makeEmailJob(data: unknown): Job<EmailJobData> {
  return { data } as Job<EmailJobData>;
}

function makeSmsJob(data: unknown): Job<SmsJobData> {
  return { data } as Job<SmsJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// processEmailJob
// ===========================================================================
describe('processEmailJob', () => {
  it('calls sendEmail with correct args for a valid payload', async () => {
    const payload = {
      to: 'client@example.com',
      subject: 'Réservation confirmée',
      html: '<p>Votre réservation est confirmée.</p>',
      text: 'Votre réservation est confirmée.',
    };
    await processEmailJob(makeEmailJob(payload));
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledWith(payload);
  });

  it('calls sendEmail without optional text field', async () => {
    const payload = {
      to: 'client@example.com',
      subject: 'Invoice disponible',
      html: '<p>Votre facture est disponible.</p>',
    };
    await processEmailJob(makeEmailJob(payload));
    expect(mocks.sendEmail).toHaveBeenCalledWith(payload);
  });

  it('throws on invalid payload — missing subject (Zod validation)', async () => {
    const badPayload = {
      to: 'client@example.com',
      // subject is missing
      html: '<p>Hello</p>',
    };
    await expect(processEmailJob(makeEmailJob(badPayload))).rejects.toThrow('[email-job] invalid payload');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('throws on invalid payload — invalid email address', async () => {
    const badPayload = {
      to: 'not-an-email',
      subject: 'Test',
      html: '<p>Hello</p>',
    };
    await expect(processEmailJob(makeEmailJob(badPayload))).rejects.toThrow('[email-job] invalid payload');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// processSmsJob
// ===========================================================================
describe('processSmsJob', () => {
  it('calls sendSMS with correct args for a valid payload (regular phone)', async () => {
    const payload = { to: '+212600123456', message: 'Votre réservation est confirmée.' };
    await processSmsJob(makeSmsJob(payload));
    expect(mocks.sendSMS).toHaveBeenCalledOnce();
    expect(mocks.sendSMS).toHaveBeenCalledWith('+212600123456', 'Votre réservation est confirmée.');
    expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
  });

  it('calls sendAdminSMS when to === "ADMIN"', async () => {
    const payload = { to: 'ADMIN', message: 'Nouvelle réservation reçue.' };
    await processSmsJob(makeSmsJob(payload));
    expect(mocks.sendAdminSMS).toHaveBeenCalledOnce();
    expect(mocks.sendAdminSMS).toHaveBeenCalledWith('Nouvelle réservation reçue.');
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it('skips silently when phone is null', async () => {
    const payload = { to: null, message: 'Rappel séjour.' };
    await processSmsJob(makeSmsJob(payload));
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
  });

  it('throws on invalid payload — missing message (Zod validation)', async () => {
    const badPayload = { to: '+212600123456' }; // message missing
    await expect(processSmsJob(makeSmsJob(badPayload))).rejects.toThrow('[sms-job] invalid payload');
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it('throws on invalid payload — empty message string', async () => {
    const badPayload = { to: '+212600123456', message: '' }; // empty fails z.string().min(1)
    await expect(processSmsJob(makeSmsJob(badPayload))).rejects.toThrow('[sms-job] invalid payload');
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });
});
