import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, updateLink, deleteLink, logLinkEvent } from '@/db';
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
  const { firstName, lastName, shareClass, investorEmail, targetSubscriptionDate, subscriptionAmount } = body;

  if (shareClass !== undefined && shareClass !== null && shareClass !== '' && !SHARE_CLASSES.includes(shareClass)) {
    return NextResponse.json({ error: `shareClass must be one of: ${SHARE_CLASSES.join(', ')}` }, { status: 400 });
  }

  if (investorEmail !== undefined && investorEmail !== null && investorEmail !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(investorEmail)) {
      return NextResponse.json({ error: 'investorEmail is not a valid email address' }, { status: 400 });
    }
  }

  if (targetSubscriptionDate !== undefined && targetSubscriptionDate !== null && targetSubscriptionDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetSubscriptionDate)) {
      return NextResponse.json({ error: 'targetSubscriptionDate must be YYYY-MM-DD' }, { status: 400 });
    }
  }

  updateLink(linkId, {
    firstName: firstName !== undefined ? firstName : undefined,
    lastName: lastName !== undefined ? lastName : undefined,
    shareClass: shareClass !== undefined ? shareClass : undefined,
    investorEmail: investorEmail !== undefined ? investorEmail : undefined,
    targetSubscriptionDate: targetSubscriptionDate !== undefined ? targetSubscriptionDate : undefined,
    subscriptionAmount: subscriptionAmount !== undefined ? subscriptionAmount : undefined,
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (firstName !== undefined && firstName !== link.first_name) changes.firstName = { from: link.first_name, to: firstName };
  if (lastName !== undefined && lastName !== link.last_name) changes.lastName = { from: link.last_name, to: lastName };
  if (shareClass !== undefined && shareClass !== link.share_class) changes.shareClass = { from: link.share_class, to: shareClass };
  if (investorEmail !== undefined && (investorEmail || null) !== link.investor_email) changes.investorEmail = { from: link.investor_email, to: investorEmail };
  if (targetSubscriptionDate !== undefined && targetSubscriptionDate !== link.target_subscription_date) changes.targetSubscriptionDate = { from: link.target_subscription_date, to: targetSubscriptionDate };
  if (subscriptionAmount !== undefined && subscriptionAmount !== link.subscription_amount) changes.subscriptionAmount = { from: link.subscription_amount, to: subscriptionAmount };
  if (Object.keys(changes).length > 0) {
    const admin = await getAdminSession();
    logLinkEvent(linkId, 'admin_edit', { changes, actor: admin?.name || 'Admin' });
  }

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
