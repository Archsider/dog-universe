import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';
import { petDocumentNameSchema, formatZodError } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Validation Zod du champ name (string optionnel, max 255)
    const rawName = formData.get('name');
    const nameParse = petDocumentNameSchema.safeParse({
      name: typeof rawName === 'string' ? rawName : undefined,
    });
    if (!nameParse.success) {
      return NextResponse.json(formatZodError(nameParse.error), { status: 400 });
    }
    const finalName = nameParse.data.name?.trim() || file.name;

    const uploadResult = await uploadFile(file, 'document');

    const document = await prisma.petDocument.create({
      data: {
        petId: id,
        name: finalName,
        fileUrl: uploadResult.url,
        storageKey: uploadResult.storageKey ?? null,
        fileType: uploadResult.mimeType,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Upload document error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const documentId = url.searchParams.get('documentId');
  if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await prisma.petDocument.delete({ where: { id: documentId, petId: id } });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ message: 'Deleted' });
}
