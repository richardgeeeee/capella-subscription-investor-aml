import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getCertifiedCopyById, deleteCertifiedCopy, updateCertifiedCopySyncStatus, getLinkById, logLinkEvent } from '@/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { certId } = await params;
  const copy = getCertifiedCopyById(certId);
  if (!copy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!fs.existsSync(copy.stored_path)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  const buffer = fs.readFileSync(copy.stored_path);
  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = inline
    ? `inline; filename="${encodeURIComponent(copy.display_name)}"`
    : `attachment; filename="${encodeURIComponent(copy.display_name)}"`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { certId } = await params;
  const copy = getCertifiedCopyById(certId);
  if (!copy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const storedPath = deleteCertifiedCopy(certId);
  if (storedPath && fs.existsSync(storedPath)) {
    fs.unlinkSync(storedPath);
  }

  const admin = await getAdminSession();
  logLinkEvent(copy.link_id, 'certified_copy_deleted', {
    certId,
    displayName: copy.display_name,
    actor: admin?.name || 'Admin',
  });

  return NextResponse.json({ success: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { certId } = await params;
  const copy = getCertifiedCopyById(certId);
  if (!copy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const link = getLinkById(copy.link_id);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  if (!process.env.GAS_WEB_APP_URL || !process.env.GAS_API_KEY) {
    return NextResponse.json({ error: 'Google Drive sync not configured' }, { status: 400 });
  }

  try {
    updateCertifiedCopySyncStatus(certId, 'syncing');

    const { formatDriveFolderName } = await import('@/lib/file-naming');
    const folderName = formatDriveFolderName(link.first_name, link.last_name, link.investor_name);

    const buffer = fs.readFileSync(copy.stored_path);
    const file = new File([buffer], copy.display_name, { type: 'application/pdf' });

    const response = await fetch(process.env.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.GAS_API_KEY,
        folderName,
        folderId: link.drive_folder_id || undefined,
        fileName: copy.display_name,
        documentType: 'certified_true_copy',
        mimeType: 'application/pdf',
        fileBase64: buffer.toString('base64'),
      }),
    });

    if (!response.ok) throw new Error(`GAS upload failed: ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Upload failed');

    updateCertifiedCopySyncStatus(certId, 'synced', result.fileId);

    const admin = await getAdminSession();
    logLinkEvent(copy.link_id, 'certified_copy_synced', {
      certId,
      displayName: copy.display_name,
      actor: admin?.name || 'Admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    updateCertifiedCopySyncStatus(certId, 'failed');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
