import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendSMS: vi.fn(),
  sendAdminSMS: vi.fn(),
  tryReserveSmsSend: vi.fn().mockResolvedValue(true),
  markSmsSent: vi.fn().mockResolvedValue(undefined),
  enqueueSms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
}));

vi.mock('@/lib/sms-dedup', () => ({
  tryReserveSmsSend: mocks.tryReserveSmsSend,
  markSmsSent: mocks.markSmsSent,
}));

vi.mock('@/lib/queues', () => ({
  enqueueSms: mocks.enqueueSms,
}));

import {
  sendEmailNow,
  sendSmsNow,
  sendEmailWithRetry,
  sendSmsWithRetry,
  sendSmsRespectful,
} from '@/lib/notify-now';

describe('notify-now', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.sendEmail.mockReset();
    mocks.sendSMS.mockReset();
    mocks.sendAdminSMS.mockReset();
    mocks.tryReserveSmsSend.mockReset().mockResolvedValue(true);
    mocks.markSmsSent.mockReset().mockResolvedValue(undefined);
    mocks.enqueueSms.mockReset().mockResolvedValue(undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  it('sendEmailNow returns synchronously (void)', () => {
    mocks.sendEmail.mockResolvedValue(undefined);
    const result = sendEmailNow({ to: 'a@b.com', subject: 's', html: '<p/>' });
    expect(result).toBeUndefined();
  });

  it('sendEmailWithRetry succeeds on first attempt', async () => {
    mocks.sendEmail.mockResolvedValueOnce(undefined);
    const promise = sendEmailWithRetry({ to: 'a@b.com', subject: 's', html: '<p/>' });
    await promise;
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendEmailWithRetry succeeds on second attempt after one failure', async () => {
    mocks.sendEmail
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const promise = sendEmailWithRetry({ to: 'user@example.com', subject: 's', html: '<p/>' });
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendEmailWithRetry logs structured error after 3 failed attempts and does not throw', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('smtp down'));
    const promise = sendEmailWithRetry({ to: 'user@example.com', subject: 's', html: '<p/>' });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toBeUndefined();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.service).toBe('notify-now');
    expect(logged.error).toBe('smtp down');
    expect(logged.to).toContain('***');
  });

  it('sendSmsWithRetry succeeds on first attempt (returns true)', async () => {
    mocks.sendSMS.mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await promise;
    expect(mocks.tryReserveSmsSend).toHaveBeenCalledWith('+212600000000', 'hi');
    expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
    expect(mocks.markSmsSent).toHaveBeenCalledWith('+212600000000', 'hi');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry skips entirely when reservation is lost (concurrent duplicate)', async () => {
    // Simulate: two concurrent calls for the same (phone, message). One
    // wins the SmsLog INSERT race, the other loses → tryReserveSmsSend
    // returns false → no send, no error.
    mocks.tryReserveSmsSend.mockResolvedValueOnce(false);
    const promise = sendSmsWithRetry({ to: 'ADMIN', message: '💰 Paiement reçu' });
    await promise;
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
    expect(mocks.markSmsSent).not.toHaveBeenCalled();
    // The lost-race path is a warn, not an error.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry retries when sendSMS returns false (config not lost-race)', async () => {
    mocks.sendSMS
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;
    expect(mocks.sendSMS).toHaveBeenCalledTimes(2);
    expect(mocks.markSmsSent).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry logs error after 3 failed attempts (always returns false)', async () => {
    mocks.sendSMS.mockResolvedValue(false);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toBeUndefined();
    expect(mocks.sendSMS).toHaveBeenCalledTimes(3);
    // markSmsSent must NOT be called when the SMS never actually delivered.
    // The reservation row stays PENDING and blocks re-sends for the window.
    expect(mocks.markSmsSent).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('sendSmsWithRetry routes ADMIN to sendAdminSMS', async () => {
    mocks.sendAdminSMS.mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: 'ADMIN', message: 'alert' });
    await promise;
    expect(mocks.tryReserveSmsSend).toHaveBeenCalledWith('ADMIN', 'alert');
    expect(mocks.sendAdminSMS).toHaveBeenCalledWith('alert');
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry skips silently when to is null (no reservation either)', async () => {
    const promise = sendSmsWithRetry({ to: null as unknown as string, message: 'x' });
    await promise;
    expect(mocks.tryReserveSmsSend).not.toHaveBeenCalled();
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsNow returns void synchronously', () => {
    mocks.sendSMS.mockResolvedValue(true);
    const result = sendSmsNow({ to: '+212600000000', message: 'hi' });
    expect(result).toBeUndefined();
  });

  // ── sendSmsRespectful — policy integration ─────────────────────────────
  // The decision logic is fully unit-tested in sms-policy.test.ts. These
  // tests cover the WIRING: each policy outcome must translate into the
  // right runtime action (direct send, BullMQ delayed enqueue, or skip).
  describe('sendSmsRespectful — policy integration', () => {
    // Anchor time inside business hours so quiet-hours doesn't fire.
    const noonCasa = new Date('2026-05-14T11:00:00Z'); // 12:00 Casa

    // Anchor time inside quiet hours.
    const midnightCasa = new Date('2026-05-14T23:00:00Z'); // 00:00 Casa next day

    it('OPS + standard + business hours → sends directly via gateway', async () => {
      vi.setSystemTime(noonCasa);
      mocks.sendSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: '+212600000000', message: 'taxi en route' },
        { category: 'OPS', recipient: 'standard' },
      );
      // sendSmsNow is fire-and-forget — drain the microtask queue.
      await vi.runAllTimersAsync();
      expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueSms).not.toHaveBeenCalled();
    });

    it('OPS + walkin → still sends (urgent ops override walk-in skip)', async () => {
      vi.setSystemTime(noonCasa);
      mocks.sendSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: '+212600000000', message: 'taxi arrivé' },
        { category: 'OPS', recipient: 'walkin' },
      );
      await vi.runAllTimersAsync();
      expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
    });

    it('OPS + standard + quiet hours → still sends (OPS bypasses quiet)', async () => {
      vi.setSystemTime(midnightCasa);
      mocks.sendSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: '+212600000000', message: 'taxi tracking' },
        { category: 'OPS', recipient: 'standard' },
      );
      await vi.runAllTimersAsync();
      expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueSms).not.toHaveBeenCalled();
    });

    it('COMPTA + walkin → suppressed entirely (no send, no enqueue)', () => {
      vi.setSystemTime(noonCasa);
      sendSmsRespectful(
        { to: '+212600000000', message: 'Paiement reçu' },
        { category: 'COMPTA', recipient: 'walkin' },
      );
      expect(mocks.sendSMS).not.toHaveBeenCalled();
      expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
      expect(mocks.enqueueSms).not.toHaveBeenCalled();
      expect(mocks.tryReserveSmsSend).not.toHaveBeenCalled();
    });

    it('COMPTA + standard + business hours → direct send', async () => {
      vi.setSystemTime(noonCasa);
      mocks.sendSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: '+212600000000', message: 'Paiement reçu' },
        { category: 'COMPTA', recipient: 'standard' },
      );
      await vi.runAllTimersAsync();
      expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueSms).not.toHaveBeenCalled();
    });

    it('COMPTA + standard + quiet hours → BullMQ defer with positive delay', () => {
      vi.setSystemTime(midnightCasa);
      sendSmsRespectful(
        { to: '+212600000000', message: 'Paiement reçu' },
        { category: 'COMPTA', recipient: 'standard' },
      );
      expect(mocks.sendSMS).not.toHaveBeenCalled();
      expect(mocks.enqueueSms).toHaveBeenCalledTimes(1);
      const call = mocks.enqueueSms.mock.calls[0];
      // call args: (data, jobId, { delay })
      expect(call[0]).toEqual({ to: '+212600000000', message: 'Paiement reçu' });
      expect(call[2]?.delay).toBeGreaterThan(0);
      // Concretely: ~9h from 00:00 Casa to 09:00 Casa
      expect(call[2].delay).toBe(9 * 3600 * 1000);
    });

    it('ADMIN recipient + COMPTA + quiet hours → still immediate (admin wants to know)', async () => {
      vi.setSystemTime(midnightCasa);
      mocks.sendAdminSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: 'ADMIN', message: 'Paiement enregistré' },
        { category: 'COMPTA' },
      );
      await vi.runAllTimersAsync();
      expect(mocks.sendAdminSMS).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueSms).not.toHaveBeenCalled();
    });

    it('auto-detects ADMIN sentinel even without explicit recipient prop', async () => {
      vi.setSystemTime(midnightCasa);
      mocks.sendAdminSMS.mockResolvedValue(true);
      sendSmsRespectful(
        { to: 'ADMIN', message: 'alerte' },
        { category: 'COMPTA' }, // no `recipient` prop
      );
      await vi.runAllTimersAsync();
      expect(mocks.sendAdminSMS).toHaveBeenCalledTimes(1);
    });
  });
});
