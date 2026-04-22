import { redirect } from 'next/navigation';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { getOrCreateSubmission, getFilesByLinkId, getSubmissionVersions } from '@/db';
import { InvestorForm } from './_components/InvestorForm';
import { TopUpForm } from './_components/TopUpForm';
import { EmailLogin } from './_components/EmailLogin';

export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = validateToken(token);

  if (!result.valid) {
    redirect('/expired');
  }

  const link = result.link!;
  const session = await getSessionFromCookie();

  // Check if session is valid and belongs to this link
  const isAuthenticated = session && session.link_id === link.id;

  if (!isAuthenticated) {
    return (
      <EmailLogin
        token={token}
        investorName={link.investor_name}
        investorType={link.investor_type}
        investorEmail={link.investor_email}
      />
    );
  }

  // Load saved draft and files
  const submission = getOrCreateSubmission(link.id, session.email);
  const files = getFilesByLinkId(link.id);
  const savedFormData = JSON.parse(submission.form_data || '{}');
  const uploadedFiles = files.map(f => ({
    id: f.id,
    documentType: f.document_type,
    originalName: f.original_name,
    mimeType: f.mime_type,
    fileSize: f.file_size,
    uploadedAt: f.uploaded_at,
  }));
  const versions = getSubmissionVersions(submission.id);
  const latestVersion = versions[0];

  const linkCategory = link.link_category || 'new_subscription';

  if (linkCategory === 'topup') {
    return (
      <TopUpForm
        token={token}
        investorName={link.investor_name}
        shareClass={link.share_class}
        expiresAt={link.expires_at}
        savedFormData={savedFormData}
        uploadedFiles={uploadedFiles}
        submittedVersionCount={versions.length}
        lastSubmittedAt={latestVersion?.submitted_at || null}
      />
    );
  }

  return (
    <InvestorForm
      token={token}
      investorName={link.investor_name}
      investorType={link.investor_type}
      shareClass={link.share_class}
      expiresAt={link.expires_at}
      savedFormData={savedFormData}
      uploadedFiles={uploadedFiles}
      submittedVersionCount={versions.length}
      lastSubmittedAt={latestVersion?.submitted_at || null}
    />
  );
}
