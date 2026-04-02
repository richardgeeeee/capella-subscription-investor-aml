import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionsByLinkId, getFilesByLinkId, getLinkById } from '@/db';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const linkId = request.nextUrl.searchParams.get('linkId');
  if (!linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const submissions = getSubmissionsByLinkId(linkId);
  const files = getFilesByLinkId(linkId);

  return NextResponse.json({
    link,
    submissions: submissions.map(s => ({
      ...s,
      form_data: JSON.parse(s.form_data || '{}'),
    })),
    files,
  });
}
