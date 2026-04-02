import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { getOrCreateSubmission, updateSubmissionFormData } from '@/db';

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { token, formData } = body;

  if (!token || !formData) {
    return NextResponse.json({ error: 'token and formData are required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }

  if (session.link_id !== result.link!.id) {
    return NextResponse.json({ error: 'Session does not match link' }, { status: 403 });
  }

  const submission = getOrCreateSubmission(result.link!.id, session.email);
  updateSubmissionFormData(submission.id, JSON.stringify(formData));

  return NextResponse.json({ success: true, submissionId: submission.id });
}
