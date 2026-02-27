import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findUnique({ where: { id } });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const uploadResult = await uploadFile(file, 'document');

    const document = await prisma.petDocument.create({
      data: {
        petId: id,
        name: name?.trim() || file.name,
        fileUrl: uploadResult.url,
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
  const { documentId } = await request.json();

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.petDocument.delete({ where: { id: documentId, petId: id } });
  return NextResponse.json({ message: 'Deleted' });
}
