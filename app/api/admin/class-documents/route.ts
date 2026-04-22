import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getShareClassDocuments, getAllShareClassDocuments, createShareClassDocument } from '@/db';
import { SHARE_CLASSES } from '@/lib/constants';

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const shareClass = url.searchParams.get('shareClass');
  const docs = shareClass ? getShareClassDocuments(shareClass) : getAllShareClassDocuments();
  return NextResponse.json({ documents: docs });
}

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const shareClass = formData.get('shareClass') as string;
  const name = formData.get('name') as string;
  const file = formData.get('file') as File;

  if (!shareClass || !name || !file) {
    return NextResponse.json({ error: 'shareClass, name, and file are required' }, { status: 400 });
  }

  if (!SHARE_CLASSES.includes(shareClass as typeof SHARE_CLASSES[number])) {
    return NextResponse.json({ error: `Invalid shareClass: ${shareClass}` }, { status: 400 });
  }

  const docDir = process.env.TEMPLATE_DIR || './templates';
  const classDir = path.join(docDir, 'class-documents');
  if (!fs.existsSync(classDir)) fs.mkdirSync(classDir, { recursive: true });

  const id = crypto.randomUUID();
  const ext = path.extname(file.name);
  const filePath = path.join(classDir, `${id}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  createShareClassDocument({
    id,
    shareClass,
    name,
    filePath,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: buffer.length,
  });

  return NextResponse.json({ success: true, id });
}
