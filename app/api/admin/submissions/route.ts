import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionsByLinkId, getFilesByLinkId, getLinkById, getSubmissionVersions } from '@/db';
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
  const files = getFilesByLinkId(linkId).map(f => ({
    ...f,
    address_verification: f.address_verification ? JSON.parse(f.address_verification) : null,
  }));
  const fileMap = new Map(files.map(f => [f.id, f]));

  const submissionsWithVersions = submissions.map(s => {
    const versions = getSubmissionVersions(s.id);
    return {
      ...s,
      form_data: JSON.parse(s.form_data || '{}'),
      versions: versions.map(v => ({
        id: v.id,
        version_number: v.version_number,
        submitted_at: v.submitted_at,
        form_data: JSON.parse(v.form_data || '{}'),
        files: (JSON.parse(v.file_ids || '[]') as string[])
          .map(fid => fileMap.get(fid))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .map(f => ({
            id: f.id,
            document_type: f.document_type,
            original_name: f.original_name,
            display_name: f.display_name,
            file_size: f.file_size,
          })),
      })),
    };
  });

  return NextResponse.json({
    link,
    submissions: submissionsWithVersions,
    files,
  });
}
