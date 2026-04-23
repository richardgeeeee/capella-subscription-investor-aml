import { NextResponse } from 'next/server';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getSubmissionsByLinkId, logLinkEvent, setLinkDriveFolderId } from '@/db';
import { syncSubmissionToGoogleDrive, isDriveSyncConfigured, listDriveFolders } from '@/lib/google-drive-sync';
import { formatDriveFolderName } from '@/lib/file-naming';

function similarityScore(a: string, b: string): number {
  const normalize = (s: string) => s.replace(/^\d+\s+/, '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const words = na.split(/\s+/);
  const matches = words.filter(w => nb.includes(w)).length;
  return words.length > 0 ? matches / words.length * 0.6 : 0;
}

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isDriveSyncConfigured()) {
    return NextResponse.json({ error: 'Google Drive sync is not configured.' }, { status: 500 });
  }

  const body = await request.json();
  const { linkId, force, resolvedFolderId } = body;

  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const link = getLinkById(linkId);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const submissions = getSubmissionsByLinkId(linkId);
  const submission = submissions[0];
  if (!submission) return NextResponse.json({ error: 'No submission found' }, { status: 400 });

  const admin = await getAdminSession();
  const actor = admin?.name || 'Admin';

  // If admin resolved a folder conflict, update the link's folder ID
  if (resolvedFolderId !== undefined) {
    setLinkDriveFolderId(linkId, resolvedFolderId || '');
    logLinkEvent(linkId, 'drive_folder_resolved', {
      folderId: resolvedFolderId || '(create new)',
      actor,
    });
  }

  // Pre-check: if link has a stored folder ID, verify it still exists
  if (link.drive_folder_id && !resolvedFolderId) {
    try {
      const allFolders = await listDriveFolders();
      const found = allFolders.some(f => f.id === link.drive_folder_id);

      if (!found) {
        const expectedName = formatDriveFolderName(link.first_name, link.last_name, link.investor_name);
        const similar = allFolders
          .map(f => ({ ...f, score: similarityScore(f.name, expectedName) }))
          .filter(f => f.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        logLinkEvent(linkId, 'drive_folder_stale', {
          oldFolderId: link.drive_folder_id,
          message: 'Original Drive folder was deleted or trashed',
          actor,
        });

        return NextResponse.json({
          folderConflict: true,
          message: 'The original Google Drive folder has been deleted or moved to trash.',
          expectedName,
          similarFolders: similar.map(f => ({ id: f.id, name: f.name, url: f.url })),
        });
      }
    } catch (err) {
      console.warn('[sync] folder pre-check failed, proceeding anyway:', err);
    }
  }

  try {
    await syncSubmissionToGoogleDrive(submission.id, { force: !!force });
    logLinkEvent(linkId, 'drive_sync_success', { submissionId: submission.id, force: !!force, actor });
    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err) {
    console.error('Failed to sync to Drive:', err);
    logLinkEvent(linkId, 'drive_sync_failed', { submissionId: submission.id, force: !!force, error: String(err), actor });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
