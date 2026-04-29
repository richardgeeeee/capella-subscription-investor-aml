import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkByToken, createUploadedFile, getOrCreateSubmission, getFilesByLinkId, logLinkEvent } from '@/db';
import { formatDisplayName } from '@/lib/file-naming';
import { extractPaymentInfo } from '@/lib/payment-verify';
import { updatePaymentExtraction } from '@/db';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const token = formData.get('token') as string;
  const documentType = formData.get('documentType') as string;

  if (!file || !token || !documentType) {
    return NextResponse.json({ error: 'file, token, and documentType are required' }, { status: 400 });
  }

  const link = getLinkByToken(token);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const uploadDir = process.env.UPLOAD_DIR || './data/uploads';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const fileId = crypto.randomUUID();
  const ext = path.extname(file.name);
  const storedPath = path.join(uploadDir, `${fileId}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(storedPath, buffer);

  const submission = getOrCreateSubmission(link.id, 'admin@capella-capital.com');
  const existing = getFilesByLinkId(link.id).filter(f => f.document_type === documentType);
  const sequenceSuffix = existing.length + 1;
  const displayName = formatDisplayName(link.first_name, link.last_name, link.investor_name, documentType, file.name, sequenceSuffix);

  createUploadedFile({
    id: fileId,
    linkId: link.id,
    submissionId: submission.id,
    documentType,
    originalName: file.name,
    displayName,
    storedPath,
    mimeType: file.type,
    fileSize: file.size,
  });

  const admin = await getAdminSession();
  logLinkEvent(link.id, 'file_uploaded', {
    name: displayName,
    documentType,
    actor: admin?.name || 'Admin',
  });

  // Auto-extract payment proof
  if (documentType === 'payment_proof') {
    extractPaymentInfo(storedPath, file.type).then(result => {
      updatePaymentExtraction(fileId, { ...result, checked_at: new Date().toISOString() });
    }).catch(err => console.warn('[admin upload] payment extraction failed:', err));
  }

  return NextResponse.json({ success: true, fileId, displayName });
}
