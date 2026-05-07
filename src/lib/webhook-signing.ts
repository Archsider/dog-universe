import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Webhook HMAC signing — Stripe / Twilio compatible pattern.
 *
 * Tier 2 hardening (2026-05-09): provided proactively for future webhook
 * integrations (Stripe payments, Twilio inbound SMS, etc.). Not yet wired
 * into any route — this module is import-only utility code.
 *
 * Wire format:
 *   header = `t=<unix-seconds>,v1=<hex-hmac-sha256>`
 *   payload = `${timestamp}.${rawBody}`
 *   signature = HMAC_SHA256(secret, payload)
 *
 * Why timestamp in payload: prevents replay of a captured signature outside
 * the tolerance window (default 5 minutes).
 */

/**
 * Produce a hex HMAC-SHA256 signature for the given body and timestamp.
 *
 * @param secret  Shared secret (string). Caller is responsible for storing
 *                this in env / KMS — never hardcode.
 * @param body    Raw request body (exact bytes the verifier will read).
 * @param timestamp Unix seconds (integer). Use `Math.floor(Date.now()/1000)`.
 */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  if (!secret) throw new Error('signWebhook: secret is required');
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) {
    throw new Error('signWebhook: timestamp must be an integer (unix seconds)');
  }
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Verify an inbound webhook signature.
 *
 * @returns true iff signature is valid AND the timestamp is within
 *          `toleranceSeconds` of `now`.
 *
 * Constant-time comparison via `timingSafeEqual`. Mismatched-length signatures
 * return false WITHOUT calling timingSafeEqual (which throws on length diff).
 */
export function verifyWebhook(
  secret: string,
  body: string,
  signature: string,
  timestamp: number,
  toleranceSeconds: number = 300,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature) return false;
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) return false;
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  const expected = signWebhook(secret, body, timestamp);
  // Hex strings → Buffers of equal byte length on success. Length mismatch =
  // tampering or wrong digest — reject without invoking timingSafeEqual.
  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
