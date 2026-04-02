import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { verifyCodeAndCreateSession, setSessionCookie } from '@/lib/session';

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

  return NextResponse.json({ success: true });
}
