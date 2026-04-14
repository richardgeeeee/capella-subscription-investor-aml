import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getLinkById, getSubmissionsByLinkId } from '@/db';
import { syncSubmissionToGoogleDrive, isDriveSyncConfigured } from '@/lib/google-drive-sync';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDriveSyncConfigured()) {
    return NextResponse.json({
      error: 'Google Drive sync is not configured. Set GAS_WEB_APP_URL and GAS_API_KEY in Railway after deploying the Apps Script.',
    }, { status: 500 });
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

  // Use the most recently updated submission (we sync the live state)
  const submissions = getSubmissionsByLinkId(linkId);
  const submission = submissions[0];
  if (!submission) {
    return NextResponse.json({ error: 'No submission found for this link' }, { status: 400 });
  }

  try {
    await syncSubmissionToGoogleDrive(submission.id);
    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err) {
    console.error('Failed to sync to Drive:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
