import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { createUploadedFile, getOrCreateSubmission, getFilesByLinkId, deleteFileById } from '@/db';
import { MAX_FILE_SIZE, ACCEPTED_MIME_TYPES } from '@/lib/constants';

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

  // Delete previous file of same document type (for non-multiple types)
  const isMultiple = documentType.startsWith('personnel_');
  if (!isMultiple) {
    const existingFiles = getFilesByLinkId(result.link!.id);
    for (const existing of existingFiles) {
      if (existing.document_type === documentType) {
        // Delete old file from disk
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

  // Get or create submission
  const submission = getOrCreateSubmission(result.link!.id, session.email);

  // Create DB record
  createUploadedFile({
    id: fileId,
    linkId: result.link!.id,
    submissionId: submission.id,
    documentType,
    originalName: file.name,
    storedPath,
    mimeType: file.type,
    fileSize: file.size,
  });

  return NextResponse.json({
    success: true,
    fileId,
    originalName: file.name,
    documentType,
    fileSize: file.size,
  });
}
