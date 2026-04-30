import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { uploadFile, type UploadType } from '@/lib/upload';

const VALID_UPLOAD_TYPES: UploadType[] = ['pet-photo', 'document', 'stay-photo'];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const rawFile = formData.get('file');
    const rawType = formData.get('type') as string | null;
    const uploadType: UploadType =
      rawType && (VALID_UPLOAD_TYPES as string[]).includes(rawType)
        ? (rawType as UploadType)
        : 'pet-photo';

    if (!rawFile || !(rawFile instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const file = rawFile;

    const result = await uploadFile(file, uploadType);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'upload', message: 'Upload error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
