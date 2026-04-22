import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getContractTemplateById } from '@/db';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { templateId } = await params;
  const tpl = getContractTemplateById(templateId);
  if (!tpl) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (!fs.existsSync(tpl.file_path)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  const buffer = fs.readFileSync(tpl.file_path);
  const mime = MIME_MAP[tpl.file_type] || 'application/octet-stream';
  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = inline
    ? `inline; filename="${encodeURIComponent(tpl.original_name)}"`
    : `attachment; filename="${encodeURIComponent(tpl.original_name)}"`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
    },
  });
}
