# End-of-stay report — AI step 2 (SCOPING ONLY, not implemented)

> The manual template (step 1) is live as of 2026-05-15. This doc scopes
> the future AI-assisted draft generation. **No code is shipped from this
> document — it's a contract for the next PR.**

## Why a step 2 at all

The manual template (step 1) requires the admin to remember everything
that happened during the stay. For 1-2 pets at a time it's fine ; for a
busy week with 8 boarders simultaneously, recall degrades and reports
become generic ("RAS, animal sociable, bonne hydratation").

AI can lift the cognitive load — but ONLY if it has real data to lean on.
Without source notes, the model hallucinates ("Chippie a beaucoup joué
avec Max" when Max wasn't even there). That is **un-shippable**.

## Hard prerequisite : DailyLog table

The AI step CANNOT start until we ship a daily-log feature first. Admin
records 30 seconds of notes per animal per day during a stay :

```
DailyLog
  id            String      @id
  bookingId     String      (FK Booking)
  petId         String      (FK Pet)
  loggedAt      DateTime    (Casablanca date-only, one row per pet per day)
  mood          String?     // happy | calm | anxious | restless
  appetite      String?     // good | irregular | refused
  social        String?     // alone | with_others | shy
  incidents     String?     // free text (vomiting, limp, fight, etc.)
  notes         String?     // free text general
  loggedBy      String      (FK User, admin)
```

Without this : AI hallucinates. Decision: **DailyLog feature is a
prerequisite PR**, scoped separately.

## Generation contract (once DailyLog exists)

### Model

`claude-haiku-4-5-20251001` — cost/speed-optimal for this volume.
We already use it for vaccination extraction (see CLAUDE.md → ANTHROPIC API).

### Workflow (mandatory)

```
[Admin clicks "Générer IA" on /end-report]
   │
   ▼
Server-side: aggregate the stay's data:
   - All DailyLog rows for (bookingId, all petIds)
   - Pet metadata: name, species, breed, dob (age), allergies, gender
   - Booking metadata: dates, service type, nights
   - PII strip per RGPD (no email, phone, address — only pet + activity data)
   │
   ▼
Anthropic API call — Haiku 4.5, ~1500 input tokens, ~500 output
   │
   ▼
Response parsed into the SAME 5-section formData shape
(reuses src/lib/end-stay-report.ts → SECTIONS catalogue)
   │
   ▼
formData injected into the existing /end-report form (step 1 UI)
   formData.version = 2  (AI draft, not yet edited by admin)
   │
   ▼
Admin reviews, edits, may revert any section
   │
   ▼
Admin clicks "Send"
   formData.version = 3  (AI draft, edited by admin)
   formData.version = 2  (AI draft, sent verbatim — explicit checkbox required)
   │
   ▼
Same pipeline as step 1 (Notification + email)
```

**No auto-send.** Even if the admin loves the draft, sending requires a
human click. Anti-hallucination defense + accountability.

### Prompt template

```
You are a structured report generator for Dog Universe, a pet boarding
facility in Marrakech. Given the daily notes for a pet's stay, produce
a JSON object matching this schema (do not deviate):

{
  "sections": {
    "behaviour":   { "checked": ["calm" | "social" | "anxious_start" | "playful" | "reserved"], "freeText": string },
    "food":        { "checked": ["ate_normally" | "irregular_appetite" | "refused_some_meals" | "well_hydrated"], "freeText": string },
    "sleep":       { "checked": ["slept_well" | "night_wakings" | "regular_naps"], "freeText": string },
    "activities":  { "checked": ["daily_outings" | "play_other_animals" | "walks" | "brushing"], "freeText": string },
    "health":      { "checked": ["ras" | "mild_fatigue_day1" | "minor_incident"], "freeText": string }
  },
  "closingNote": string
}

Rules:
- Use ONLY information from the daily logs provided. Do NOT invent facts.
- If a section has no relevant data, return empty `checked` and empty
  `freeText` — let the admin decide whether to add anything.
- Free text must be 2-3 sentences max per section, in <LOCALE>.
- Use natural prose, not bullet points (those are already represented
  via the `checked` array).
- Pet name must appear exactly as <PET_NAME>.
- Closing note is one short warm sentence, not generic.

Daily logs (chronological):
<DAILY_LOG_DUMP>

Pet context: <PET_CONTEXT>
Stay: <STAY_CONTEXT>
Locale: <LOCALE>
```

### Cost estimate

At current scale (Dog Universe end-2026 : ~20-30 stays/month) :
- ~1500 input + ~500 output tokens per report
- Haiku 4.5 pricing : ~$0.001 input / $0.005 output per 1k tokens
- Cost per report : ~$0.0035 → **~0.035 MAD per report**
- Monthly : 25 × 0.035 = **~0.9 MAD/month**

Negligible. Cost is not a constraint.

### Field `version` semantics

| version | Meaning | Source |
|---:|---|---|
| 1 | Manual template (step 1) | Admin typed everything |
| 2 | AI draft sent verbatim | Admin clicked "Send AI draft as-is" (extra checkbox required in UI) |
| 3 | AI draft edited by admin | Admin clicked "Generate", reviewed, edited, then sent |

Used by analytics : if version 3 dominates, the AI is useful as a starting
point. If version 2 dominates with high client satisfaction, the AI is
mature enough to streamline. If version 1 stays dominant after AI is
shipped, the AI isn't earning its keep.

## Risks acknowledged

1. **Hallucination** : mitigated by the DailyLog prerequisite + the
   mandatory admin review step. The prompt explicitly forbids invented
   facts.
2. **Generic tone** : every report ending up with "Chippie est une chatte
   merveilleuse" templated language. Mitigation : prompt requires
   sentences derived from log content ; if logs are empty, free text
   returns empty.
3. **RGPD** : we send pet + activity data to Anthropic, no human PII
   (no client email, name, phone, address). Sanitisation is server-side
   before the API call.
4. **Anthropic outage** : the "Générer IA" button shows an error toast ;
   admin can fall back to step 1 (manual template) on the same form.

## Out of scope for this scoping doc

- DailyLog data entry UX (separate PR)
- DailyLog quick-input from mobile (separate PR)
- A/B test framework for prompt iterations (later)
- Multi-language report generation (Arabic) — locale=fr|en suffisant pour V1
