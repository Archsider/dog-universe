import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { generateContractPDF } from '@/lib/contract-pdf';
import { uploadBufferPrivate, createSignedUrl } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = session.user.id;

  // Check if already signed
  const existing = await prisma.clientContract.findUnique({
    where: { clientId },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'Contract already signed' },
      { status: 409 }
    );
  }

  let signatureDataUrl: string;
  try {
    const body = await req.json();
    signatureDataUrl = body.signatureDataUrl;
    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Invalid signature data' }, { status: 400 });
    }
    // Guard against oversized payloads (max 2 MB base64 ≈ 1.5 MB image)
    if (signatureDataUrl.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Signature image too large' }, { status: 400 });
    }
    // A blank transparent canvas produces a very small PNG (~300 chars base64).
    // A real signature is always significantly larger. Reject trivially empty ones.
    const base64Data = signatureDataUrl.split(',')[1] ?? '';
    if (base64Data.length < 1500) {
      return NextResponse.json({ error: 'Signature vide — veuillez signer avant de valider' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { name: true, email: true },
  });
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  const signedAt = new Date();
  const pdfStorageKey = `contracts/${clientId}.pdf`;
  const signatureBackupKey = `contracts/${clientId}-signature.png`;

  // ── ÉTAPE 1 : Backup de la signature brute (toujours, jamais bloquant) ─────
  // Permet à l'admin de régénérer le PDF plus tard si la génération échoue.
  // Un upload de buffer PNG via Supabase est ultra-stable (jamais vu échouer
  // sauf si Supabase est down, auquel cas on est de toute façon bloqués plus loin).
  try {
    const sigBuffer = Buffer.from(signatureDataUrl.split(',')[1] ?? '', 'base64');
    await uploadBufferPrivate(sigBuffer, signatureBackupKey, 'image/png');
  } catch (err) {
    console.error('[contracts/sign] signature backup upload failed (non-fatal):', err);
  }

  // ── ÉTAPE 2 : Tentative de génération + upload du PDF (best-effort) ───────
  // Si ça échoue, on continue quand même : le contrat sera enregistré en DB
  // et le client débloqué. L'admin pourra régénérer le PDF a posteriori
  // (la signature brute est sauvegardée à l'étape 1).
  let pdfGenerated = false;
  try {
    const pdfBuffer = await generateContractPDF({
      clientName: client.name,
      clientEmail: client.email,
      signedAt,
      signatureDataUrl,
      ipAddress,
      version: '1.0',
    });
    await uploadBufferPrivate(pdfBuffer, pdfStorageKey, 'application/pdf');
    pdfGenerated = true;
  } catch (err) {
    // Logs structurés détaillés pour diagnostic prod
    const errInfo = err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack?.split('\n').slice(0, 5).join('\n'),
        }
      : { raw: String(err) };
    console.error('[contracts/sign] PDF generation/upload failed (non-fatal — contract still saved)', JSON.stringify({
      clientId,
      signatureLength: signatureDataUrl.length,
      cwd: process.cwd(),
      err: errInfo,
    }));
  }

  // ── ÉTAPE 3 : Sauvegarde DB (TOUJOURS, même si PDF a échoué) ──────────────
  // C'est le geste qui débloque l'accès portail du client. Le storageKey
  // pointe vers le PDF attendu — s'il n'existe pas encore, createSignedUrl
  // échouera proprement et le client verra le contrat signé sans bouton
  // de téléchargement (acceptable, l'admin régénérera).
  try {
    await prisma.clientContract.create({
      data: {
        clientId,
        signedAt,
        storageKey: pdfStorageKey,
        ipAddress,
        version: '1.0',
      },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Contract already signed' }, { status: 409 });
    }
    throw err;
  }

  // ── ÉTAPE 4 : URL de téléchargement (uniquement si PDF généré) ────────────
  let downloadUrl: string | null = null;
  if (pdfGenerated) {
    try {
      downloadUrl = await createSignedUrl(pdfStorageKey);
    } catch (err) {
      console.error('[contracts/sign] Signed URL generation failed after PDF upload:', err);
    }
  }

  return NextResponse.json({
    success: true,
    downloadUrl,
    pdfPending: !pdfGenerated,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = session.user.id;

  const contract = await prisma.clientContract.findUnique({
    where: { clientId },
    select: { signedAt: true, storageKey: true, version: true },
  });

  if (!contract) {
    return NextResponse.json({ contract: null });
  }

  // Generate a fresh signed URL valid for 1 hour
  let downloadUrl: string | null = null;
  try {
    downloadUrl = await createSignedUrl(contract.storageKey);
  } catch (err) {
    console.error('Signed URL generation failed:', err);
    // Return contract metadata without download URL rather than 500
  }

  return NextResponse.json({
    contract: { signedAt: contract.signedAt, downloadUrl, version: contract.version },
  });
}
