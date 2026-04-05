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

  // Enforce pre-set email if configured
  if (result.link!.investor_email && result.link!.investor_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: 'This link is restricted to the pre-set email address. / 此链接仅限预设邮箱使用。' }, { status: 403 });
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
