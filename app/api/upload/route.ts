import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { createUploadedFile, getOrCreateSubmission, getFilesByLinkId, deleteFileById, getSubmissionVersions, getFileById } from '@/db';
import { MAX_FILE_SIZE, ACCEPTED_MIME_TYPES } from '@/lib/constants';
import { formatDisplayName } from '@/lib/file-naming';

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const token = formData.get('token') as string;
  const documentType = formData.get('documentType') as string;
  const file = formData.get('file') as File;

  if (!token || !documentType || !file) {
    return NextResponse.json({ error: 'token, documentType, and file are required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }

  // Verify session belongs to this link
  if (session.link_id !== result.link!.id) {
    return NextResponse.json({ error: 'Session does not match link' }, { status: 403 });
  }

  // Validate file
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
  }

  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  // Ensure upload directory exists
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const linkDir = path.join(uploadDir, result.link!.id);
  if (!fs.existsSync(linkDir)) {
    fs.mkdirSync(linkDir, { recursive: true });
  }

  // Get or create submission first (needed to check version references)
  const submission = getOrCreateSubmission(result.link!.id, session.email);

  // For non-multiple document types, remove the previous file of same type
  // BUT keep files that are referenced by any submission version (preserve history)
  const isMultiple = documentType.startsWith('personnel_');
  if (!isMultiple) {
    const existingFiles = getFilesByLinkId(result.link!.id);
    const versions = getSubmissionVersions(submission.id);
    const referencedFileIds = new Set<string>();
    for (const v of versions) {
      for (const fid of JSON.parse(v.file_ids || '[]') as string[]) {
        referencedFileIds.add(fid);
      }
    }
    for (const existing of existingFiles) {
      if (existing.document_type === documentType) {
        if (referencedFileIds.has(existing.id)) {
          // Keep as historical record — do not delete from DB or disk
          continue;
        }
        if (fs.existsSync(existing.stored_path)) {
          fs.unlinkSync(existing.stored_path);
        }
        deleteFileById(existing.id);
      }
    }
  }

  // Save file
  const fileId = crypto.randomUUID();
  const ext = path.extname(file.name) || '.bin';
  const storedPath = path.join(linkDir, `${fileId}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(storedPath, buffer);

  // Compute display name. For multiple-file types (personnel_*), append a sequence
  // suffix so multiple files of the same type get distinct names.
  const link = result.link!;
  let sequenceSuffix: number | undefined;
  if (isMultiple) {
    const existing = getFilesByLinkId(link.id).filter(f => f.document_type === documentType);
    sequenceSuffix = existing.length + 1;
  }
  const displayName = formatDisplayName(
    link.first_name,
    link.last_name,
    link.investor_name,
    documentType,
    file.name,
    sequenceSuffix
  );

  // Create DB record
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

  // Auto-extract payment proof info in background
  if (documentType === 'payment_proof') {
    import('@/lib/payment-verify').then(({ extractPaymentInfo }) => {
      extractPaymentInfo(storedPath, file.type).then(result => {
        import('@/db').then(({ updatePaymentExtraction }) => {
          updatePaymentExtraction(fileId, { ...result, checked_at: new Date().toISOString() });
        });
      }).catch(err => console.warn('[payment extraction] auto-extract failed:', err));
    });
  }

  return NextResponse.json({
    success: true,
    fileId,
    originalName: file.name,
    displayName,
    documentType,
    fileSize: file.size,
    triggerAddressVerify: documentType === 'address_proof' && link.investor_type === 'individual',
  });
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { fileId } = await request.json();
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  const file = getFileById(fileId);
  if (!file || file.link_id !== session.link_id) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    if (file.stored_path && fs.existsSync(file.stored_path)) {
      fs.unlinkSync(file.stored_path);
    }
  } catch { /* ignore */ }
  deleteFileById(fileId);

  return NextResponse.json({ success: true });
}
