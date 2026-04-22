import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createLink, logLinkEvent } from '@/db';
import { generateToken } from '@/lib/token';
import { verifyApiKey, verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { DEFAULT_LINK_EXPIRY_DAYS, SHARE_CLASSES } from '@/lib/constants';
import { formatLinkTag } from '@/lib/file-naming';

export async function POST(request: Request) {
  try {
    // Auth: either API key or admin session
    const isApiKey = verifyApiKey(request);
    const isAdmin = await verifyAdminSession();
    if (!isApiKey && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, shareClass, investorType, investorEmail, expiresInDays, linkCategory, driveFolderId } = body;

    if (!firstName || !lastName || !investorType) {
      return NextResponse.json({ error: 'firstName, lastName, and investorType are required' }, { status: 400 });
    }

    if (!['individual', 'corporate'].includes(investorType)) {
      return NextResponse.json({ error: 'investorType must be "individual" or "corporate"' }, { status: 400 });
    }

    if (shareClass && !SHARE_CLASSES.includes(shareClass)) {
      return NextResponse.json({ error: `shareClass must be one of: ${SHARE_CLASSES.join(', ')}` }, { status: 400 });
    }

    const category = linkCategory === 'topup' ? 'topup' : 'new_subscription';

    const investorName = `${firstName.trim()} ${lastName.trim()}`;
    const id = crypto.randomUUID();
    const token = generateToken();
    const days = expiresInDays || DEFAULT_LINK_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    createLink({
      id,
      token,
      investorName,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      shareClass: shareClass || undefined,
      investorType,
      investorEmail,
      expiresAt,
      linkCategory: category,
    });

    // For top-ups linked to an existing investor's Drive folder
    if (driveFolderId) {
      const { setLinkDriveFolderId } = await import('@/db');
      setLinkDriveFolderId(id, driveFolderId);
    }

    const admin = await getAdminSession();
    logLinkEvent(id, 'link_created', { actor: admin?.name || 'Admin' });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const tag = formatLinkTag(firstName.trim(), lastName.trim());
    const url = `${baseUrl}/submit/${token}${tag ? `?n=${tag}` : ''}`;

    return NextResponse.json({
      id,
      token,
      url,
      investorName,
      firstName,
      lastName,
      shareClass,
      investorType,
      expiresAt,
    });
  } catch (err) {
    console.error('Failed to generate link:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
