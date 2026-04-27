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
  const storageKey = `contracts/${clientId}.pdf`;

  // Generate PDF — strict mode : si ça échoue, on remonte une erreur propre
  // au client (qui pourra réessayer). Le ClientContract n'est créé que si
  // le PDF est bien généré et uploadé. Pas de "best-effort" — soit tout
  // marche, soit le client réessaie.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateContractPDF({
      clientName: client.name,
      clientEmail: client.email,
      signedAt,
      signatureDataUrl,
      ipAddress,
      version: '1.0',
    });
  } catch (err) {
    const errInfo = err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack?.split('\n').slice(0, 5).join('\n'),
        }
      : { raw: String(err) };
    console.error('[contracts/sign] PDF_GENERATION_FAILED', JSON.stringify({
      clientId,
      signatureLength: signatureDataUrl.length,
      cwd: process.cwd(),
      err: errInfo,
    }));
    return NextResponse.json({ error: 'PDF_GENERATION_FAILED' }, { status: 500 });
  }

  // Upload to the PRIVATE Supabase Storage bucket
  try {
    await uploadBufferPrivate(pdfBuffer, storageKey, 'application/pdf');
  } catch (err) {
    console.error('[contracts/sign] STORAGE_UPLOAD_FAILED:', err);
    return NextResponse.json({ error: 'STORAGE_UPLOAD_FAILED' }, { status: 500 });
  }

  // Save contract record in DB — catch P2002 for concurrent signing race condition
  try {
    await prisma.clientContract.create({
      data: {
        clientId,
        signedAt,
        storageKey,
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

  // Return a time-limited signed URL (1h) — never expose a permanent public URL
  let downloadUrl: string | null = null;
  try {
    downloadUrl = await createSignedUrl(storageKey);
  } catch (err) {
    // Contract is saved — signed URL failure is non-critical, client can retrieve it later
    console.error('[contracts/sign] Signed URL generation failed after contract save:', err);
  }

  return NextResponse.json({ success: true, downloadUrl });
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
