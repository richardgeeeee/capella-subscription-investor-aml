import { NextResponse } from 'next/server';
import { getLinksByEmail } from '@/db';
import { createAndStoreVerificationCode } from '@/lib/session';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const links = getLinksByEmail(email.toLowerCase());
  if (links.length === 0) {
    return NextResponse.json({ found: false });
  }

  // Use the most recent active link
  const link = links[0];
  const code = createAndStoreVerificationCode(link.id, email.toLowerCase());

  try {
    await sendVerificationEmail(email, code, link.investor_name);
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ found: true, linkId: link.id });
}
