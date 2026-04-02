import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { createAndStoreVerificationCode } from '@/lib/session';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json();
  const { token, email } = body;

  if (!token || !email) {
    return NextResponse.json({ error: 'token and email are required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }

  const code = createAndStoreVerificationCode(result.link!.id, email);

  try {
    await sendVerificationEmail(email, code, result.link!.investor_name);
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
