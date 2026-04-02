import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createLink } from '@/db';
import { generateToken } from '@/lib/token';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';
import { DEFAULT_LINK_EXPIRY_DAYS } from '@/lib/constants';

export async function POST(request: Request) {
  // Auth: either API key or admin session
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { investorName, investorType, investorEmail, expiresInDays } = body;

  if (!investorName || !investorType) {
    return NextResponse.json({ error: 'investorName and investorType are required' }, { status: 400 });
  }

  if (!['individual', 'corporate'].includes(investorType)) {
    return NextResponse.json({ error: 'investorType must be "individual" or "corporate"' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const token = generateToken();
  const days = expiresInDays || DEFAULT_LINK_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  createLink({
    id,
    token,
    investorName,
    investorType,
    investorEmail,
    expiresAt,
  });

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/submit/${token}`;

  return NextResponse.json({
    id,
    token,
    url,
    investorName,
    investorType,
    expiresAt,
  });
}
