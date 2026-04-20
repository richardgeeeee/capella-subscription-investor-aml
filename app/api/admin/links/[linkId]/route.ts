import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getLinkById, updateLink, deleteLink } from '@/db';
import { SHARE_CLASSES } from '@/lib/constants';

export async function PATCH(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { linkId } = await params;
  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const body = await request.json();
  const { firstName, lastName, sequenceNumber, shareClass, investorEmail } = body;

  if (sequenceNumber !== undefined && (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0)) {
    return NextResponse.json({ error: 'sequenceNumber must be a positive integer' }, { status: 400 });
  }

  if (shareClass !== undefined && shareClass !== null && shareClass !== '' && !SHARE_CLASSES.includes(shareClass)) {
    return NextResponse.json({ error: `shareClass must be one of: ${SHARE_CLASSES.join(', ')}` }, { status: 400 });
  }

  if (investorEmail !== undefined && investorEmail !== null && investorEmail !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(investorEmail)) {
      return NextResponse.json({ error: 'investorEmail is not a valid email address' }, { status: 400 });
    }
  }

  updateLink(linkId, {
    firstName: firstName !== undefined ? firstName : undefined,
    lastName: lastName !== undefined ? lastName : undefined,
    sequenceNumber: sequenceNumber !== undefined ? sequenceNumber : undefined,
    shareClass: shareClass !== undefined ? shareClass : undefined,
    investorEmail: investorEmail !== undefined ? investorEmail : undefined,
  });

  return NextResponse.json({ success: true, link: getLinkById(linkId) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { linkId } = await params;
  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const filePaths = deleteLink(linkId);

  for (const p of filePaths) {
    try {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      console.warn(`[delete link] failed to unlink ${p}:`, err);
    }
  }

  const dataDir = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data';
  const draftDir = path.join(dataDir, 'drafts', linkId);
  if (fs.existsSync(draftDir)) {
    try {
      fs.rmSync(draftDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[delete link] failed to remove drafts dir ${draftDir}:`, err);
    }
  }

  return NextResponse.json({ success: true });
}
