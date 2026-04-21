import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ linkId: string; fileName: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { linkId, fileName } = await params;
  const decodedFileName = decodeURIComponent(fileName);

  // Sanity: reject path traversal
  if (decodedFileName.includes('/') || decodedFileName.includes('..')) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  const dataDir = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data';
  const filePath = path.join(dataDir, 'drafts', linkId, decodedFileName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(decodedFileName).toLowerCase();
  const mimeType = ext === '.docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';

  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const disposition = inline
    ? `inline; filename="${encodeURIComponent(decodedFileName)}"`
    : `attachment; filename="${encodeURIComponent(decodedFileName)}"`;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
    },
  });
}
