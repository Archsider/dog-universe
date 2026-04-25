import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';
import { createSignedUrl } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

const EXTRACTION_PROMPT = `Tu analyses un document de vaccination pour un animal de compagnie (chien ou chat).
Ce document peut être une vignette de vaccin, un carnet de vaccination, un passeport animal, ou un certificat vétérinaire.

Extrait les informations suivantes si elles sont lisibles :
1. Nom du vaccin (ex: "Rage", "CPHPL", "DHPP", "Leptospirose", "Bordetella", "Rabies", etc.)
2. Date d'administration (la date à laquelle le vaccin a été administré)
3. Date de rappel / prochaine injection (si indiquée)
4. Nom du vétérinaire ou de la clinique (si visible)
5. Remarques utiles (numéro de lot, fabricant, etc.)

Retourne UNIQUEMENT un objet JSON avec exactement ces champs :
{
  "vaccineType": "nom du vaccin ou null si illisible",
  "date": "YYYY-MM-DD ou null si illisible ou absente",
  "nextDueDate": "YYYY-MM-DD ou null si absente",
  "comment": "vétérinaire/clinique et notes ou null",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "confidenceNote": "explication courte de ce qui a été détecté ou non"
}

Règles strictes :
- Ne jamais inventer une valeur non visible dans le document
- confidence = HIGH si vaccineType ET date sont clairement lisibles
- confidence = MEDIUM si au moins vaccineType OU date est lisible
- confidence = LOW si très peu de données sont lisibles (image floue, document illisible)
- Si le document n'est pas une preuve de vaccination, retourner tous les champs à null et confidence = LOW
- Répondre UNIQUEMENT avec le JSON, sans markdown ni explication`;

interface ExtractionResult {
  vaccineType: string | null;
  date: string | null;
  nextDueDate: string | null;
  comment: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceNote: string;
}

async function fetchFileAsBase64(fileUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      const res = await fetch(fileUrl);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const mimeType = contentType.split(';')[0].trim();
      const buffer = Buffer.from(await res.arrayBuffer());
      return { base64: buffer.toString('base64'), mimeType };
    }

    // Local dev: fileUrl is like "/uploads/documents/filename.jpg"
    if (fileUrl.startsWith('/')) {
      const localPath = path.join(process.cwd(), 'public', fileUrl);
      const buffer = await readFile(localPath);
      const ext = path.extname(fileUrl).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.pdf': 'application/pdf',
      };
      const mimeType = mimeMap[ext] ?? 'application/octet-stream';
      return { base64: buffer.toString('base64'), mimeType };
    }

    return null;
  } catch {
    return null;
  }
}

async function callClaudeExtraction(base64: string, mimeType: string): Promise<ExtractionResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  try {
    let contentBlock: Anthropic.MessageParam['content'];

    if (mimeType === 'application/pdf') {
      contentBlock = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: EXTRACTION_PROMPT },
      ];
    } else if (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp' ||
      mimeType === 'image/gif'
    ) {
      contentBlock = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: base64,
          },
        },
        { type: 'text', text: EXTRACTION_PROMPT },
      ];
    } else {
      return null;
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: contentBlock }],
    });

    const text = message.content.find(b => b.type === 'text')?.text ?? '';
    // Strip possible markdown code fences
    const jsonStr = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonStr) as ExtractionResult;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findUnique({ where: { id } });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { documentId } = await request.json();
    if (!documentId) return NextResponse.json({ error: 'MISSING_DOCUMENT_ID' }, { status: 400 });

    const doc = await prisma.petDocument.findUnique({
      where: { id: documentId, petId: id },
      select: { id: true, fileUrl: true, storageKey: true, fileType: true },
    });
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Idempotent: if a DRAFT already exists for this document, return it
    const existingDraft = await prisma.vaccination.findFirst({
      where: { petId: id, sourceDocumentId: documentId, status: 'DRAFT' },
    });
    if (existingDraft) return NextResponse.json(existingDraft);

    // Use storageKey to generate a fresh signed URL (avoids 1-hour expiry issue)
    const fileUrl = doc.storageKey ? await createSignedUrl(doc.storageKey) : doc.fileUrl;
    const fileData = await fetchFileAsBase64(fileUrl);
    let extraction: ExtractionResult | null = null;

    if (fileData) {
      extraction = await callClaudeExtraction(fileData.base64, fileData.mimeType);
    }

    // Create DRAFT vaccination regardless of extraction success
    // If extraction failed: empty fields, user fills manually
    const draft = await prisma.vaccination.create({
      data: {
        petId: id,
        vaccineType: extraction?.vaccineType?.trim() ?? '',
        date: extraction?.date ? new Date(extraction.date) : null,
        nextDueDate: extraction?.nextDueDate ? new Date(extraction.nextDueDate) : null,
        comment: extraction?.comment?.trim() ?? null,
        status: 'DRAFT',
        isAutoDetected: extraction !== null,
        sourceDocumentId: documentId,
      },
    });

    return NextResponse.json({
      ...draft,
      _extractionConfidence: extraction?.confidence ?? null,
      _extractionNote: extraction?.confidenceNote ?? null,
    }, { status: 201 });
  } catch (error) {
    console.error('Vaccination extraction error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
