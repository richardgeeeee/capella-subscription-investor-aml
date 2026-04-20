import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { verifyCodeAndCreateSession, setSessionCookie } from '@/lib/session';
import { logLinkEvent, getLinkEvents } from '@/db';

export async function POST(request: Request) {
  const body = await request.json();
  const { token, email, code } = body;

  if (!token || !email || !code) {
    return NextResponse.json({ error: 'token, email, and code are required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }

  const sessionToken = verifyCodeAndCreateSession(result.link!.id, email, code);
  if (!sessionToken) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  await setSessionCookie(sessionToken);

  // Log only the first successful login per link to avoid log spam.
  const linkId = result.link!.id;
  const hasFirstLogin = getLinkEvents(linkId).some(e => e.event_type === 'investor_first_login');
  if (!hasFirstLogin) {
    logLinkEvent(linkId, 'investor_first_login', { email });
  }

  return NextResponse.json({ success: true });
}
