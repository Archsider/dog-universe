// Worker processor functions — called by the cron endpoint (/api/workers/process).
// Each processor wraps its send call in a circuit breaker:
//   - CLOSED (healthy): sends normally
//   - OPEN (provider down): fallback moves the job to the DLQ immediately,
//     no timeout wait, API never crashes
//   - HALF-OPEN (recovering): probes the provider once; success closes the circuit
import type { Job } from 'bullmq';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';
import { getEmailBreaker, getSmsBreaker } from '@/lib/circuit-breaker';

// Wrap the actual send functions once; the breakers are module-level singletons
// so the state is shared across jobs processed in the same Vercel function invocation.
const emailSend = async (data: EmailJobData) => { await sendEmail(data); };
const smsSend   = async (data: SmsJobData) => {
  if (data.to === 'ADMIN') {
    await sendAdminSMS(data.message);
  } else if (data.to) {
    await sendSMS(data.to, data.message);
  }
};

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  await getEmailBreaker(emailSend).fire(job.data);
}

export async function processSmsJob(job: Job<SmsJobData>): Promise<void> {
  await getSmsBreaker(smsSend).fire(job.data);
}
