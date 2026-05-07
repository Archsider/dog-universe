import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendSMS: vi.fn(),
  sendAdminSMS: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
}));

import {
  sendEmailNow,
  sendSmsNow,
  sendEmailWithRetry,
  sendSmsWithRetry,
} from '@/lib/notify-now';

describe('notify-now', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.sendEmail.mockReset();
    mocks.sendSMS.mockReset();
    mocks.sendAdminSMS.mockReset();
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
    expect(logged.to).toContain('***'); // email masked
  });

  it('sendSmsWithRetry succeeds on first attempt (returns true)', async () => {
    mocks.sendSMS.mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await promise;
    expect(mocks.sendSMS).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry retries when sendSMS returns false', async () => {
    mocks.sendSMS
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;
    expect(mocks.sendSMS).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry logs error after 3 failed attempts (always returns false)', async () => {
    mocks.sendSMS.mockResolvedValue(false);
    const promise = sendSmsWithRetry({ to: '+212600000000', message: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toBeUndefined();
    expect(mocks.sendSMS).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.service).toBe('notify-now');
  });

  it('sendSmsWithRetry routes ADMIN to sendAdminSMS', async () => {
    mocks.sendAdminSMS.mockResolvedValueOnce(true);
    const promise = sendSmsWithRetry({ to: 'ADMIN', message: 'alert' });
    await promise;
    expect(mocks.sendAdminSMS).toHaveBeenCalledWith('alert');
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it('sendSmsWithRetry skips silently when to is null', async () => {
    const promise = sendSmsWithRetry({ to: null as unknown as string, message: 'x' });
    await promise;
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.sendAdminSMS).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sendSmsNow returns void synchronously', () => {
    mocks.sendSMS.mockResolvedValue(true);
    const result = sendSmsNow({ to: '+212600000000', message: 'hi' });
    expect(result).toBeUndefined();
  });
});
