import { NextResponse } from 'next/server';
import { getShareClassDocuments } from '@/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shareClass = url.searchParams.get('shareClass');
  if (!shareClass) {
    return NextResponse.json({ error: 'shareClass is required' }, { status: 400 });
  }

  const docs = getShareClassDocuments(shareClass);
  return NextResponse.json({
    documents: docs.map(d => ({
      id: d.id,
      name: d.name,
      originalName: d.original_name,
      mimeType: d.mime_type,
      fileSize: d.file_size,
    })),
  });
}
