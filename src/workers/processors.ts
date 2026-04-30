// Worker processor functions — called by the cron endpoint (/api/workers/process).
// Each processor receives a BullMQ Job and executes the side-effect (send email / SMS).
// Failed jobs are retried up to 3× with exponential backoff as defined in the queue options.
// After all retries are exhausted, BullMQ moves the job to "failed" state and the DLQ
// listener in /api/workers/process archives it to the dlq queue for manual inspection.
import type { Job } from 'bullmq';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';

// Validate job payloads at deserialise. If Redis returns a malformed blob
// (corruption, manual edit, version skew between producer and consumer), we
// throw so BullMQ retries → DLQ — never silently send `undefined` to SMTP.
const emailJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
});

const smsJobSchema = z.object({
  to: z.union([z.string().min(1), z.null()]),
  message: z.string().min(1),
});

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const parsed = emailJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`[email-job] invalid payload: ${parsed.error.message}`);
  }
  await sendEmail(parsed.data);
}

export async function processSmsJob(job: Job<SmsJobData>): Promise<void> {
  const parsed = smsJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`[sms-job] invalid payload: ${parsed.error.message}`);
  }
  const { to, message } = parsed.data;
  if (to === 'ADMIN') {
    await sendAdminSMS(message);
  } else if (to) {
    await sendSMS(to, message);
  }
}
