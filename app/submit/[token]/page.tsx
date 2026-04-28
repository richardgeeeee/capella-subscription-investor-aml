import { redirect } from 'next/navigation';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { getOrCreateSubmission, getFilesByLinkId, getSubmissionVersions, getSubmissionsByLinkId } from '@/db';
import { verifyAdminSession } from '@/lib/admin-auth';
import { InvestorForm } from './_components/InvestorForm';
import { TopUpForm } from './_components/TopUpForm';
import { EmailLogin } from './_components/EmailLogin';

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const query = await searchParams;
  const result = validateToken(token);

  if (!result.valid) {
    redirect('/expired');
  }

  const link = result.link!;

  // Admin preview: bypass email login if admin is authenticated
  const isAdminPreview = query.preview === '1' && await verifyAdminSession();

  const session = await getSessionFromCookie();
  const isAuthenticated = session && session.link_id === link.id;

  if (!isAuthenticated && !isAdminPreview) {
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
  let savedFormData: Record<string, string> = {};
  let uploadedFiles: Array<{ id: string; documentType: string; originalName: string; mimeType: string; fileSize: number; uploadedAt: string }> = [];
  let versions: Array<{ submitted_at: string }> = [];

  if (isAuthenticated) {
    const submission = getOrCreateSubmission(link.id, session.email);
    const files = getFilesByLinkId(link.id);
    savedFormData = JSON.parse(submission.form_data || '{}');
    uploadedFiles = files.map(f => ({
      id: f.id, documentType: f.document_type, originalName: f.original_name,
      mimeType: f.mime_type, fileSize: f.file_size, uploadedAt: f.uploaded_at,
    }));
    versions = getSubmissionVersions(submission.id);
  } else {
    // Admin preview: load existing data without creating a submission
    const submissions = getSubmissionsByLinkId(link.id);
    if (submissions[0]) {
      savedFormData = JSON.parse(submissions[0].form_data || '{}');
      const files = getFilesByLinkId(link.id);
      uploadedFiles = files.map(f => ({
        id: f.id, documentType: f.document_type, originalName: f.original_name,
        mimeType: f.mime_type, fileSize: f.file_size, uploadedAt: f.uploaded_at,
      }));
      versions = getSubmissionVersions(submissions[0].id);
    }
  }

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
      investorEmail={link.investor_email}
      expiresAt={link.expires_at}
      savedFormData={savedFormData}
      uploadedFiles={uploadedFiles}
      submittedVersionCount={versions.length}
      lastSubmittedAt={latestVersion?.submitted_at || null}
    />
  );
}
