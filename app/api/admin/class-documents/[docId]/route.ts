import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getShareClassDocumentById, updateShareClassDocument, deleteShareClassDocument } from '@/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const doc = getShareClassDocumentById(docId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!fs.existsSync(doc.file_path)) return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });

  const buffer = fs.readFileSync(doc.file_path);
  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = inline
    ? `inline; filename="${encodeURIComponent(doc.original_name)}"`
    : `attachment; filename="${encodeURIComponent(doc.original_name)}"`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const doc = getShareClassDocumentById(docId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  updateShareClassDocument(docId, {
    name: body.name,
    description: body.description,
    sortOrder: body.sortOrder,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const filePath = deleteShareClassDocument(docId);
  if (!filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  return NextResponse.json({ success: true });
}
