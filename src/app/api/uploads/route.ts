import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { uploadFile, type UploadType } from '@/lib/upload';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const rawFile = formData.get('file');
    const uploadType = (formData.get('type') as UploadType) ?? 'pet-photo';

    if (!rawFile || !(rawFile instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const file = rawFile;

    const result = await uploadFile(file, uploadType);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
