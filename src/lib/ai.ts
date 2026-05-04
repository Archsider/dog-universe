/**
 * AI helpers for Dog Universe — Anthropic Claude API.
 *
 * PII rule (RGPD): prompts may only include ownerFirstName (first name only,
 * never email / phone / address / DB IDs), petName, species, stay metadata,
 * and anonymised note content. Never pass User.id, User.email, or any
 * directly identifying field to the API.
 */

import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface WeeklyPetReportOptions {
  ownerFirstName: string;   // first name only — NEVER email / ID
  petName: string;
  species: 'DOG' | 'CAT';
  stayDaysCount: number;
  adminNotesThisWeek: string[]; // note content only, already anonymised
  photosCount: number;
  locale: 'fr' | 'en';
}

/**
 * Generate a warm, reassuring weekly stay report for a pet owner.
 *
 * Returns null on any failure (API unavailable, missing key, unexpected
 * response) — callers must handle null gracefully (skip or use fallback text).
 */
export async function generateWeeklyPetReport(
  opts: WeeklyPetReportOptions,
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const notesText =
    opts.adminNotesThisWeek.length > 0
      ? opts.adminNotesThisWeek.join(' — ')
      : opts.locale === 'fr'
        ? "L'équipe n'a pas laissé de notes particulières cette semaine."
        : 'The team did not leave any particular notes this week.';

  const speciesFr = opts.species === 'DOG' ? 'chien' : 'chat';
  const speciesEn = opts.species === 'DOG' ? 'dog' : 'cat';

  const prompt =
    opts.locale === 'fr'
      ? `Tu es l'assistant de Dog Universe, une pension pour animaux premium à Marrakech.
Génère un rapport hebdomadaire chaleureux et rassurant pour le propriétaire de l'animal.
Ton message doit être personnel, bienveillant, maximum 150 mots.
Commence par "Bonjour ${opts.ownerFirstName}," puis parle de ${opts.petName} (${speciesFr}).
L'animal est chez nous depuis ${opts.stayDaysCount} jour${opts.stayDaysCount > 1 ? 's' : ''}.
Notes de l'équipe cette semaine : ${notesText}.
${opts.photosCount} photo${opts.photosCount > 1 ? 's' : ''} partagée${opts.photosCount > 1 ? 's' : ''} cette semaine.
Termine par une phrase rassurante sur le bien-être de l'animal.`
      : `You are the assistant of Dog Universe, a premium pet boarding facility in Marrakech.
Generate a warm and reassuring weekly report for the pet owner.
Your message must be personal, caring, and no longer than 150 words.
Start with "Hello ${opts.ownerFirstName}," then talk about ${opts.petName} (${speciesEn}).
The animal has been with us for ${opts.stayDaysCount} day${opts.stayDaysCount > 1 ? 's' : ''}.
Team notes this week: ${notesText}.
${opts.photosCount} photo${opts.photosCount > 1 ? 's' : ''} shared this week.
End with a reassuring sentence about the animal's well-being.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== 'text') return null;

    return block.text.trim() || null;
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'ai',
      message: 'generateWeeklyPetReport failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
    return null;
  }
}
