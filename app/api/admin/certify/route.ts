import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getFilesByLinkId, getFileById, createCertifiedCopy, getCertifiedCopiesByLinkId, logLinkEvent } from '@/db';
import { generateCertifiedPdf } from '@/lib/certify';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { linkId, fileId } = await request.json();
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const link = getLinkById(linkId);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const admin = await getAdminSession();
  const certDate = new Date();
  const certDir = path.join(
    process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data',
    'certified',
    linkId
  );
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  // Single file mode: certify one specific file
  if (fileId) {
    const file = getFileById(fileId);
    if (!file || file.link_id !== linkId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    try {
      const result = await certifySingleFile(file, link, certDate, certDir, admin?.name || 'Admin');
      return NextResponse.json({ generated: [result] });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  // Batch mode: certify all uploaded files
  const allFiles = getFilesByLinkId(linkId);
  if (allFiles.length === 0) {
    return NextResponse.json({ error: 'No documents found' }, { status: 400 });
  }

  const generated: Array<{ id: string; displayName: string; fileSize: number }> = [];
  const errors: Array<{ fileId: string; error: string }> = [];

  for (const file of allFiles) {
    try {
      const result = await certifySingleFile(file, link, certDate, certDir, admin?.name || 'Admin');
      generated.push(result);
    } catch (err) {
      errors.push({
        fileId: file.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logLinkEvent(linkId, 'certified_copy_generated', {
    count: generated.length,
    errors: errors.length,
    actor: admin?.name || 'Admin',
  });

  return NextResponse.json({ generated, errors });
}

async function certifySingleFile(
  file: { id: string; stored_path: string; mime_type: string; display_name: string | null; original_name: string; document_type: string },
  link: { id: string; first_name: string | null; last_name: string | null; investor_name: string },
  certDate: Date,
  certDir: string,
  certifiedBy: string
) {
  const pdfBuffer = await generateCertifiedPdf(file.stored_path, file.mime_type, certDate, file.document_type);

  const certId = crypto.randomUUID();
  const baseName = (file.display_name || file.original_name).replace(/\.[^.]+$/, '');
  const displayName = `${baseName}-Certified True Copy.pdf`;
  const storedPath = path.join(certDir, `${certId}.pdf`);

  fs.writeFileSync(storedPath, pdfBuffer);

  createCertifiedCopy({
    id: certId,
    linkId: link.id,
    sourceFileIds: [file.id],
    displayName,
    storedPath,
    fileSize: pdfBuffer.length,
    certifiedBy,
  });

  return { id: certId, displayName, fileSize: pdfBuffer.length };
}

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const linkId = request.nextUrl.searchParams.get('linkId');
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const copies = getCertifiedCopiesByLinkId(linkId);
  return NextResponse.json({ copies });
}
