import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import {
  getOrCreateSubmission,
  finalizeSubmission,
  getFilesByLinkId,
  createSubmissionVersion,
  logLinkEvent,
} from '@/db';
import { individualFormSchema, corporateFormSchema, topupFormSchema, amountQualifiesForAssetProofWaiver } from '@/lib/validation';
import { INDIVIDUAL_DOCUMENT_TYPES, CORPORATE_DOCUMENT_TYPES, TOPUP_DOCUMENT_TYPES } from '@/lib/constants';
import { syncSubmissionToGoogleDrive } from '@/lib/google-drive-sync';

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }

  if (session.link_id !== result.link!.id) {
    return NextResponse.json({ error: 'Session does not match link' }, { status: 403 });
  }

  const submission = getOrCreateSubmission(result.link!.id, session.email);
  const formData = JSON.parse(submission.form_data || '{}');

  const linkCategory = result.link!.link_category || 'new_subscription';
  const isTopup = linkCategory === 'topup';

  // Validate form data
  const schema = isTopup
    ? topupFormSchema
    : result.link!.investor_type === 'individual' ? individualFormSchema : corporateFormSchema;
  const validation = schema.safeParse(formData);
  if (!validation.success) {
    return NextResponse.json({
      error: 'Form validation failed',
      details: validation.error.issues,
    }, { status: 400 });
  }

  // Check required documents
  const files = getFilesByLinkId(result.link!.id);
  const uploadedTypes = new Set(files.map(f => f.document_type));

  const requiredDocs = isTopup
    ? TOPUP_DOCUMENT_TYPES
    : result.link!.investor_type === 'individual'
      ? INDIVIDUAL_DOCUMENT_TYPES
      : CORPORATE_DOCUMENT_TYPES;

  // Individual: liquid_asset_proof is waived when subscription amount > USD 1,000,000
  const waivesAssetProof = !isTopup && result.link!.investor_type === 'individual'
    && amountQualifiesForAssetProofWaiver(formData.subscriptionAmount);

  const missingDocs: string[] = [];
  for (const doc of requiredDocs) {
    const required = doc.key === 'liquid_asset_proof'
      ? (!waivesAssetProof)
      : doc.required;
    if (!required) continue;
    if ('multiple' in doc && doc.multiple) {
      if (!files.some(f => f.document_type === doc.key)) {
        missingDocs.push(doc.key);
      }
    } else {
      if (!uploadedTypes.has(doc.key)) {
        missingDocs.push(doc.key);
      }
    }
  }

  if (missingDocs.length > 0) {
    return NextResponse.json({
      error: 'Missing required documents',
      missingDocs,
    }, { status: 400 });
  }

  // Create a version snapshot
  const { versionNumber } = createSubmissionVersion({
    submissionId: submission.id,
    formData: submission.form_data,
    fileIds: files.map(f => f.id),
  });

  // Mark as finalized (but still editable — investors can submit additional versions)
  finalizeSubmission(submission.id);

  logLinkEvent(result.link!.id, 'submission_finalized', {
    submissionId: submission.id,
    versionNumber,
    fileCount: files.length,
    email: session.email,
  });

  // Trigger async Google Drive sync
  syncSubmissionToGoogleDrive(submission.id).catch(err => {
    console.error('Google Drive sync failed:', err);
  });

  return NextResponse.json({ success: true, submissionId: submission.id, versionNumber });
}
