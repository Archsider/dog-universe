// Worker processor functions — called by the cron endpoint (/api/workers/process).
// Each processor receives a BullMQ Job and executes the side-effect (send email / SMS).
// Failed jobs are retried up to 3× with exponential backoff as defined in the queue options.
// After all retries are exhausted, BullMQ moves the job to "failed" state and the DLQ
// listener in /api/workers/process archives it to the dlq queue for manual inspection.
import type { Job } from 'bullmq';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, html, text } = job.data;
  await sendEmail({ to, subject, html, text });
}

export async function processSmsJob(job: Job<SmsJobData>): Promise<void> {
  const { to, message } = job.data;
  if (to === 'ADMIN') {
    await sendAdminSMS(message);
  } else if (to) {
    await sendSMS(to, message);
  }
}
