import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getFileById } from '@/db';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId } = await params;
  const file = getFileById(fileId);
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  if (!fs.existsSync(file.stored_path)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  const buffer = fs.readFileSync(file.stored_path);
  const downloadName = file.display_name || file.original_name;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
