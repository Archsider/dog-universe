import { env } from 'process'
import CircuitBreaker from 'opossum'
import { logger } from '@/lib/logger';

// Normalise un numéro marocain vers +212XXXXXXXXX
function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-\.]/g, '')
  if (clean.startsWith('+')) return clean
  if (clean.startsWith('00')) return '+' + clean.slice(2)
  if (clean.startsWith('0')) return '+212' + clean.slice(1)
  return '+212' + clean
}

// Mask a phone number for safe logging: keep last 2 digits, mask the rest.
// "+212612345678" -> "+212********78"
function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****'
  return phone.slice(0, 4) + '*'.repeat(Math.max(0, phone.length - 6)) + phone.slice(-2)
}

type SmsSendParams = {
  baseUrl: string
  username: string
  password: string
  phone: string
  message: string
}

// Inner sender — performs the HTTP call with a 10s AbortController timeout.
// THROWS on any failure (non-2xx / network / abort) so opossum tracks errors
// and BullMQ workers can retry.
async function smsSendInner(params: SmsSendParams): Promise<true> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${params.baseUrl}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${params.username}:${params.password}`).toString('base64'),
      },
      body: JSON.stringify({
        textMessage: { text: params.message },
        phoneNumbers: [params.phone],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`SMS gateway ${res.status}: ${errBody.slice(0, 200)}`)
    }
    return true
  } finally {
    clearTimeout(timer)
  }
}

// Singleton circuit breaker — Vercel reuses Lambda containers, so this state
// (rolling error rate, open/half-open) survives across invocations on the
// same warm instance. Opens for 30s after >50% errors in the rolling window.
let _smsBreaker: CircuitBreaker<[SmsSendParams], true> | null = null
function getSmsBreaker(): CircuitBreaker<[SmsSendParams], true> {
  if (_smsBreaker) return _smsBreaker
  _smsBreaker = new CircuitBreaker(smsSendInner, {
    timeout: 12_000,                 // safety net above the 10s AbortController
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    rollingCountTimeout: 60_000,
    rollingCountBuckets: 6,
    volumeThreshold: 5,              // need ≥5 calls before tripping
  })
  _smsBreaker.on('open',     () => logger.error('sms', 'Circuit breaker OPEN'))
  _smsBreaker.on('halfOpen', () => logger.warn('sms', 'Circuit breaker HALF-OPEN'))
  _smsBreaker.on('close',    () => logger.warn('sms', 'Circuit breaker CLOSED'))
  return _smsBreaker
}

// Helper principal — envoie un SMS via sms-gate.app cloud
// Throws on failure (timeout / breaker open / gateway error) so the BullMQ
// worker retries per its `attempts` config. Phone numbers are masked in logs.
export async function sendSMS(
  phoneNumber: string | null | undefined,
  message: string
): Promise<boolean> {
  if (!phoneNumber) return false

  const url = env.SMS_GATEWAY_URL
  const username = env.SMS_GATEWAY_USERNAME
  const password = env.SMS_GATEWAY_PASSWORD

  if (!url || !username || !password) {
    logger.warn('sms', 'Missing env vars — SMS skipped')
    return false
  }

  const phone = normalizePhone(phoneNumber)
  const baseUrl = url.replace(/\/+$/, '')

  try {
    await getSmsBreaker().fire({ baseUrl, username, password, phone, message })
    return true
  } catch (err) {
    logger.error('sms', 'Send failed', { to: maskPhone(phone), error: err instanceof Error ? err.message : String(err) })
    throw err instanceof Error ? err : new Error(String(err))
  }
}

// SMS admin — envoie au numéro ADMIN_PHONE
export async function sendAdminSMS(message: string): Promise<boolean> {
  const adminPhone = env.ADMIN_PHONE
  if (!adminPhone) return false
  return sendSMS(adminPhone, message)
}

// Helper pour formater les dates en DD/MM/YYYY
export function formatDateFR(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Helper pour formater les montants MAD — accepte Decimal | number (cf. lib/decimal.ts)
export function formatMAD(amount: number | { toNumber: () => number } | string | null | undefined): string {
  let n: number;
  if (amount === null || amount === undefined) n = 0;
  else if (typeof amount === 'number') n = amount;
  else if (typeof amount === 'string') n = Number(amount) || 0;
  else n = amount.toNumber();
  return n.toLocaleString('fr-FR') + ' MAD'
}

// ─── Helpers genre / pluriel ─────────────────────────────────────────────────
// Tous prennent `pets: { gender?: string | null }[]` et retournent la forme
// française accordée. Si la liste est vide, fallback masculin singulier.

type PetForGender = { gender?: string | null }

function isAllFemale(pets: PetForGender[]): boolean {
  if (pets.length === 0) return false
  return pets.every(p => p.gender === 'FEMALE')
}

export function petCompanion(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'vos compagnes' : 'vos compagnons'
  return allFemale ? 'votre compagne' : 'votre compagnon'
}

export function petVerb(
  pets: PetForGender[],
  tense: 'present' | 'future' = 'future',
): string {
  return pets.length > 1
    ? (tense === 'future' ? 'seront' : 'sont')
    : (tense === 'future' ? 'sera' : 'est')
}

export function petArrived(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'arrivées' : 'arrivés'
  return allFemale ? 'arrivée' : 'arrivé'
}

export function petReturned(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'rentrées' : 'rentrés'
  return allFemale ? 'rentrée' : 'rentré'
}

export function petPossessive(pets: PetForGender[]): string {
  return pets.length > 1 ? 'leurs' : 'ses'
}

export function petChouchoute(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'chouchoutées' : 'chouchoutés'
  return allFemale ? 'chouchoutée' : 'chouchouté'
}
