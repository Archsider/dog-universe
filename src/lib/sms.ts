import { env } from 'process'

// Normalise un numéro marocain vers +212XXXXXXXXX
function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-\.]/g, '')
  if (clean.startsWith('+')) return clean
  if (clean.startsWith('00')) return '+' + clean.slice(2)
  if (clean.startsWith('0')) return '+212' + clean.slice(1)
  return '+212' + clean
}

// Helper principal — envoie un SMS via sms-gate.app cloud
export async function sendSMS(
  phoneNumber: string | null | undefined,
  message: string
): Promise<boolean> {
  if (!phoneNumber) return false

  const url = env.SMS_GATEWAY_URL
  const username = env.SMS_GATEWAY_USERNAME
  const password = env.SMS_GATEWAY_PASSWORD

  if (!url || !username || !password) {
    console.warn('[SMS] Missing env vars — SMS skipped')
    return false
  }

  try {
    const phone = normalizePhone(phoneNumber)
    const base = url.replace(/\/+$/, '')
    const res = await fetch(`${base}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        textMessage: { text: message },
        phoneNumbers: [phone],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[SMS] Gateway error:', res.status, errBody)
    }
    return res.ok
  } catch (err) {
    console.error('[SMS] Send failed:', err)
    return false
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

// Helper pour formater les montants MAD
export function formatMAD(amount: number): string {
  return amount.toLocaleString('fr-FR') + ' MAD'
}

// Helper espèce animal
export function petEmoji(species: string): string {
  if (species === 'CAT') return '🐱'
  return '🐾'
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

export function petPronoun(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'elles' : 'ils'
  return allFemale ? 'elle' : 'il'
}

export function petChouchoute(pets: PetForGender[]): string {
  const allFemale = isAllFemale(pets)
  if (pets.length > 1) return allFemale ? 'chouchoutées' : 'chouchoutés'
  return allFemale ? 'chouchoutée' : 'chouchouté'
}
