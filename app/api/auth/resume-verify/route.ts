import { NextResponse } from 'next/server';
import { getLinkById } from '@/db';
import { verifyCodeAndCreateSession, setSessionCookie } from '@/lib/session';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, code, linkId } = body;

  if (!email || !code || !linkId) {
    return NextResponse.json({ error: 'email, code, and linkId are required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const sessionToken = verifyCodeAndCreateSession(linkId, email.toLowerCase(), code);
  if (!sessionToken) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  await setSessionCookie(sessionToken);

  return NextResponse.json({ success: true, token: link.token });
}
