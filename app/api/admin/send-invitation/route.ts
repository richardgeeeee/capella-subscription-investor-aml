import { NextResponse } from 'next/server';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getEmailTemplate, logLinkEvent } from '@/db';
import { sendInvitationEmail } from '@/lib/email';
import { formatLinkTag } from '@/lib/file-naming';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { linkId } = body;

  if (!linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  if (!link.investor_email) {
    return NextResponse.json({ error: 'No email set for this investor' }, { status: 400 });
  }

  const template = getEmailTemplate('investor_invitation');
  if (!template) {
    return NextResponse.json({ error: 'Email template not found' }, { status: 500 });
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const tag = formatLinkTag(link.first_name, link.last_name);
  const url = `${baseUrl}/submit/${link.token}${tag ? `?n=${tag}` : ''}`;

  const admin = await getAdminSession();
  const actor = admin?.name || 'Admin';

  try {
    await sendInvitationEmail(
      link.investor_email,
      link.investor_name,
      url,
      link.expires_at,
      template
    );
    logLinkEvent(linkId, 'invitation_sent', { email: link.investor_email, actor });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to send invitation email:', err);
    logLinkEvent(linkId, 'invitation_failed', { email: link.investor_email, error: String(err), actor });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
