import { NextResponse } from 'next/server';
import { getSubmissionById } from '@/db';
import { generateContract } from '@/lib/contract';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { templateId, submissionId } = body;

  if (!templateId || !submissionId) {
    return NextResponse.json({ error: 'templateId and submissionId are required' }, { status: 400 });
  }

  const submission = getSubmissionById(submissionId);
  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  const formData = JSON.parse(submission.form_data || '{}');
  const result = await generateContract(templateId, formData);
  if (!result) {
    return NextResponse.json({ error: 'Failed to generate contract' }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
      'Content-Length': String(result.buffer.length),
    },
  });
}
