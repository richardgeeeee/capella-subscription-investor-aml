import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getFilesByLinkId, createCertifiedCopy, getCertifiedCopiesByLinkId, logLinkEvent } from '@/db';
import { generateCertifiedPdf, isCertifiableDocType } from '@/lib/certify';
import { namePrefix } from '@/lib/file-naming';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { linkId } = await request.json();
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const link = getLinkById(linkId);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const allFiles = getFilesByLinkId(linkId);
  const certifiable = allFiles.filter(f => isCertifiableDocType(f.document_type));

  if (certifiable.length === 0) {
    return NextResponse.json({ error: 'No certifiable documents found' }, { status: 400 });
  }

  const admin = await getAdminSession();
  const certDate = new Date();

  try {
    const pdfBuffer = await generateCertifiedPdf(
      certifiable.map(f => ({
        storedPath: f.stored_path,
        mimeType: f.mime_type,
      })),
      certDate
    );

    const certId = crypto.randomUUID();
    const certDir = path.join(
      process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data',
      'certified',
      linkId
    );
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    const prefix = namePrefix(link.first_name, link.last_name, link.investor_name);
    const displayName = `${prefix}-Certified True Copy.pdf`;
    const storedPath = path.join(certDir, `${certId}.pdf`);

    fs.writeFileSync(storedPath, pdfBuffer);

    createCertifiedCopy({
      id: certId,
      linkId,
      sourceFileIds: certifiable.map(f => f.id),
      displayName,
      storedPath,
      fileSize: pdfBuffer.length,
      certifiedBy: admin?.name || 'Admin',
    });

    logLinkEvent(linkId, 'certified_copy_generated', {
      certId,
      displayName,
      sourceCount: certifiable.length,
      actor: admin?.name || 'Admin',
    });

    return NextResponse.json({
      certifiedCopy: {
        id: certId,
        displayName,
        fileSize: pdfBuffer.length,
        certifiedAt: certDate.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const linkId = request.nextUrl.searchParams.get('linkId');
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const copies = getCertifiedCopiesByLinkId(linkId);
  return NextResponse.json({ copies });
}
