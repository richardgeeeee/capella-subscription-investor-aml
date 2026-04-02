import fs from 'fs';
import {
  getSubmissionById,
  getFilesByLinkId,
  getLinkById,
  updateSubmissionSyncStatus,
  updateFileSyncStatus,
} from '@/db';

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;

export async function syncSubmissionToGoogleDrive(submissionId: string): Promise<void> {
  if (!GAS_WEB_APP_URL || !GAS_API_KEY) {
    console.log('[Google Drive Sync] GAS_WEB_APP_URL or GAS_API_KEY not configured, skipping sync');
    return;
  }

  const submission = getSubmissionById(submissionId);
  if (!submission) {
    console.error(`[Google Drive Sync] Submission ${submissionId} not found`);
    return;
  }

  const link = getLinkById(submission.link_id);
  if (!link) {
    console.error(`[Google Drive Sync] Link ${submission.link_id} not found`);
    return;
  }

  updateSubmissionSyncStatus(submissionId, 'syncing');

  try {
    // 1. Sync form data as JSON
    const formDataBlob = new Blob([submission.form_data], { type: 'application/json' });
    const formDataFile = new File([formDataBlob], `${link.investor_name}_form_data.json`, { type: 'application/json' });

    await uploadFileToGAS({
      investorName: link.investor_name,
      fileName: formDataFile.name,
      documentType: 'form_data',
      file: formDataFile,
    });

    // 2. Sync uploaded files
    const files = getFilesByLinkId(link.id);
    for (const fileRecord of files) {
      if (fileRecord.drive_sync_status === 'synced') continue;

      try {
        updateFileSyncStatus(fileRecord.id, 'syncing');

        const fileBuffer = fs.readFileSync(fileRecord.stored_path);
        const file = new File([fileBuffer], fileRecord.original_name, { type: fileRecord.mime_type });

        const result = await uploadFileToGAS({
          investorName: link.investor_name,
          fileName: fileRecord.original_name,
          documentType: fileRecord.document_type,
          file,
        });

        updateFileSyncStatus(fileRecord.id, 'synced', result?.fileId);
      } catch (err) {
        console.error(`[Google Drive Sync] Failed to sync file ${fileRecord.id}:`, err);
        updateFileSyncStatus(fileRecord.id, 'failed');
      }
    }

    updateSubmissionSyncStatus(submissionId, 'synced');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Google Drive Sync] Failed to sync submission ${submissionId}:`, err);
    updateSubmissionSyncStatus(submissionId, 'failed', message);
  }
}

async function uploadFileToGAS(params: {
  investorName: string;
  fileName: string;
  documentType: string;
  file: File;
}): Promise<{ fileId?: string } | null> {
  const formData = new FormData();
  formData.append('apiKey', GAS_API_KEY!);
  formData.append('investorName', params.investorName);
  formData.append('fileName', params.fileName);
  formData.append('documentType', params.documentType);
  formData.append('file', params.file);

  const response = await fetch(GAS_WEB_APP_URL!, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`GAS upload failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
