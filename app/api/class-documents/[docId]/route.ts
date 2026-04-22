import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getShareClassDocumentById } from '@/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const doc = getShareClassDocumentById(docId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!fs.existsSync(doc.file_path)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const buffer = fs.readFileSync(doc.file_path);
  const ext = path.extname(doc.original_name);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name + ext)}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
