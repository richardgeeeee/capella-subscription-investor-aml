import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionsByLinkId, getFilesByLinkId, getLinkById, getSubmissionVersions, getLinkEvents, markLinkViewed, getCertifiedCopiesByLinkId } from '@/db';
import { verifyApiKey, verifyAdminSession, getAdminSession } from '@/lib/admin-auth';

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
    payment_extraction: (f as unknown as Record<string, string>).payment_extraction ? JSON.parse((f as unknown as Record<string, string>).payment_extraction) : null,
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
            mime_type: f.mime_type,
            file_size: f.file_size,
          })),
      })),
    };
  });

  // Build merged event timeline: link_events table + derived from existing data.
  interface TimelineEvent {
    at: string;
    type: string;
    details: Record<string, unknown>;
  }

  const timeline: TimelineEvent[] = [];

  // Derived: link creation (fallback for links created before event logging)
  const events = getLinkEvents(linkId);
  const hasLinkCreatedEvent = events.some(e => e.event_type === 'link_created');
  if (!hasLinkCreatedEvent) {
    timeline.push({ at: link.created_at, type: 'link_created', details: {} });
  }

  // Derived: each submission version (investor submission)
  for (const s of submissionsWithVersions) {
    for (const v of s.versions) {
      timeline.push({
        at: v.submitted_at,
        type: 'submission_version',
        details: {
          versionNumber: v.version_number,
          fileCount: v.files.length,
          email: s.email,
        },
      });
    }
  }

  // Derived: each file upload
  for (const f of files) {
    timeline.push({
      at: f.uploaded_at,
      type: 'file_uploaded',
      details: {
        documentType: f.document_type,
        name: f.display_name || f.original_name,
      },
    });
  }

  // Admin/system events from link_events table
  for (const ev of events) {
    // Skip derived types that overlap with auto-populated ones above.
    if (ev.event_type === 'submission_finalized') continue;
    timeline.push({
      at: ev.created_at,
      type: ev.event_type,
      details: ev.details ? JSON.parse(ev.details) : {},
    });
  }

  timeline.sort((a, b) => b.at.localeCompare(a.at));

  // Certified copies
  const certifiedCopies = getCertifiedCopiesByLinkId(linkId).map(c => ({
    ...c,
    source_file_ids: JSON.parse(c.source_file_ids || '[]'),
  }));

  // Mark this link as viewed by the current admin
  const admin = await getAdminSession();
  if (admin) markLinkViewed(admin.email, linkId);

  return NextResponse.json({
    link,
    submissions: submissionsWithVersions,
    files,
    timeline,
    certifiedCopies,
  });
}
