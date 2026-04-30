// Circuit breakers for external notification providers (Resend email, SMS).
// When a provider is down, the breaker opens to avoid hammering it and
// immediately moves jobs to the DLQ for manual retry once the provider recovers.
//
// Settings:
//   timeout 5 s        — call must resolve within 5 s or it counts as failure
//   errorThreshold 50% — circuit opens when ≥ 50 % of calls in the window fail
//   resetTimeout 30 s  — after 30 s the circuit goes half-open and probes again
//
// Integration: processEmailJob / processSmsJob wrap the send call in the
// breaker. If the circuit is open the fallback moves the job to the DLQ
// so the BullMQ retry queue isn't flooded with no-op attempts.
import CircuitBreaker from 'opossum';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';
import { getDlqQueue } from '@/lib/queues/index';
import { isBullMQConfigured } from '@/lib/redis-bullmq';

const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 5_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
};

function makeDlqFallback(label: string) {
  return async (...args: unknown[]) => {
    const data = args[0];
    console.error(JSON.stringify({ level: 'error', service: 'circuit-breaker', message: 'circuit open — job moved to DLQ', circuit: label, timestamp: new Date().toISOString() }));
    if (isBullMQConfigured()) {
      try {
        await getDlqQueue().add(`${label}-circuit-open`, { data, reason: 'CIRCUIT_OPEN' });
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', service: 'circuit-breaker', message: 'DLQ add failed', circuit: label, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
      }
    }
  };
}

// ── Email breaker ─────────────────────────────────────────────────────────────

// Lazily initialised so the module can be imported without needing sendEmail
// at require-time (avoids circular import issues during cold start).
let _emailBreaker: CircuitBreaker<[EmailJobData], void> | null = null;

export function getEmailBreaker(
  sendEmail: (data: EmailJobData) => Promise<void>,
): CircuitBreaker<[EmailJobData], void> {
  if (_emailBreaker) return _emailBreaker;

  _emailBreaker = new CircuitBreaker<[EmailJobData], void>(sendEmail, BREAKER_OPTIONS);

  _emailBreaker.fallback(makeDlqFallback('email'));
  _emailBreaker.on('open',     () => console.error(JSON.stringify({ level: 'error', service: 'circuit-breaker', message: 'circuit OPEN', circuit: 'email', timestamp: new Date().toISOString() })));
  _emailBreaker.on('halfOpen', () => console.warn(JSON.stringify({ level: 'warn', service: 'circuit-breaker', message: 'circuit HALF-OPEN', circuit: 'email', timestamp: new Date().toISOString() })));
  _emailBreaker.on('close',    () => console.warn(JSON.stringify({ level: 'warn', service: 'circuit-breaker', message: 'circuit CLOSED — recovered', circuit: 'email', timestamp: new Date().toISOString() })));

  return _emailBreaker;
}

// ── SMS breaker ───────────────────────────────────────────────────────────────

let _smsBreaker: CircuitBreaker<[SmsJobData], void> | null = null;

export function getSmsBreaker(
  sendSms: (data: SmsJobData) => Promise<void>,
): CircuitBreaker<[SmsJobData], void> {
  if (_smsBreaker) return _smsBreaker;

  _smsBreaker = new CircuitBreaker<[SmsJobData], void>(sendSms, BREAKER_OPTIONS);

  _smsBreaker.fallback(makeDlqFallback('sms'));
  _smsBreaker.on('open',     () => console.error(JSON.stringify({ level: 'error', service: 'circuit-breaker', message: 'circuit OPEN', circuit: 'sms', timestamp: new Date().toISOString() })));
  _smsBreaker.on('halfOpen', () => console.warn(JSON.stringify({ level: 'warn', service: 'circuit-breaker', message: 'circuit HALF-OPEN', circuit: 'sms', timestamp: new Date().toISOString() })));
  _smsBreaker.on('close',    () => console.warn(JSON.stringify({ level: 'warn', service: 'circuit-breaker', message: 'circuit CLOSED — recovered', circuit: 'sms', timestamp: new Date().toISOString() })));

  return _smsBreaker;
}
