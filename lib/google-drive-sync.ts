import fs from 'fs';
import path from 'path';
import {
  getSubmissionById,
  getFilesByLinkId,
  getLinkById,
  updateSubmissionSyncStatus,
  updateFileSyncStatus,
  resetFileSyncStatusForLink,
  getSubmissionVersions,
  type LinkRow,
} from '@/db';
import { formatDriveFolderName, formatDisplayName } from '@/lib/file-naming';

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;

export function isDriveSyncConfigured(): boolean {
  return !!(GAS_WEB_APP_URL && GAS_API_KEY);
}

/** Converts camelCase keys like "investorName" → "Investor_Name". */
function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('_');
}

interface EmploymentEntryCsv {
  employerName?: string;
  natureOfBusiness?: string;
  startYear?: string;
  startMonth?: string;
  endYear?: string;
  endMonth?: string;
}

function formDataToCsv(formDataJson: string): string {
  try {
    const data = JSON.parse(formDataJson) as Record<string, string>;
    const escape = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows: string[][] = [['Field', 'Value']];

    for (const [k, v] of Object.entries(data)) {
      if (k === 'employmentHistory' && v) {
        // Try to parse and flatten into multiple rows
        try {
          const entries = JSON.parse(v) as EmploymentEntryCsv[];
          if (Array.isArray(entries) && entries.length > 0) {
            entries.forEach((entry, idx) => {
              const n = idx + 1;
              rows.push([`Employment_${n}_Employer_Name`, entry.employerName ?? '']);
              rows.push([`Employment_${n}_Nature_Of_Business`, entry.natureOfBusiness ?? '']);
              const start = entry.startYear && entry.startMonth ? `${entry.startYear}-${entry.startMonth}` : (entry.startYear ?? '');
              const end = entry.endYear && entry.endMonth ? `${entry.endYear}-${entry.endMonth}` : (entry.endYear ?? 'Present');
              rows.push([`Employment_${n}_Start`, start]);
              rows.push([`Employment_${n}_End`, end]);
            });
            continue;
          }
        } catch {
          // fall through
        }
      }
      rows.push([formatFieldName(k), v ?? '']);
    }

    return rows.map(row => row.map(escape).join(',')).join('\r\n');
  } catch {
    return formDataJson;
  }
}

export async function syncSubmissionToGoogleDrive(submissionId: string, options?: { force?: boolean }): Promise<void> {
  if (!GAS_WEB_APP_URL || !GAS_API_KEY) {
    throw new Error('GAS_WEB_APP_URL or GAS_API_KEY is not configured. Deploy the Google Apps Script first.');
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

  // Force re-sync: reset all file statuses so they get re-uploaded
  if (options?.force) {
    resetFileSyncStatusForLink(link.id);
  }

  updateSubmissionSyncStatus(submissionId, 'syncing');
  const folderName = formatDriveFolderName(link.first_name, link.last_name, link.investor_name, link.sequence_number);

  try {
    // 1. Sync form data as CSV snapshot of the latest version
    const versions = getSubmissionVersions(submissionId);
    const latestVersion = versions[0];
    const formDataJson = latestVersion?.form_data || submission.form_data;
    const versionLabel = latestVersion ? `_v${latestVersion.version_number}` : '';
    const formFileName = `${folderName}-Form Data${versionLabel}.csv`;
    const csvContent = formDataToCsv(formDataJson);
    const formBlob = new Blob([csvContent], { type: 'text/csv' });
    const formFile = new File([formBlob], formFileName, { type: 'text/csv' });

    await uploadFileToGAS({
      folderName,
      fileName: formFileName,
      documentType: 'form_data',
      file: formFile,
    });

    // 2. Sync uploaded files (skip already synced unless force)
    const files = getFilesByLinkId(link.id);
    for (const fileRecord of files) {
      if (!options?.force && fileRecord.drive_sync_status === 'synced') continue;

      try {
        updateFileSyncStatus(fileRecord.id, 'syncing');

        const fileBuffer = fs.readFileSync(fileRecord.stored_path);
        const fileName = fileRecord.display_name
          || formatDisplayName(link.first_name, link.last_name, link.investor_name, fileRecord.document_type, fileRecord.original_name);
        const file = new File([fileBuffer], fileName, { type: fileRecord.mime_type });

        const result = await uploadFileToGAS({
          folderName,
          fileName,
          documentType: fileRecord.document_type,
          file,
        });

        updateFileSyncStatus(fileRecord.id, 'synced', result?.fileId);
      } catch (err) {
        console.error(`[Google Drive Sync] Failed to sync file ${fileRecord.id}:`, err);
        updateFileSyncStatus(fileRecord.id, 'failed');
      }
    }

    // 3. Sync any draft agreement files in /app/data/drafts/{linkId}/
    await syncDraftAgreements(link, folderName);

    updateSubmissionSyncStatus(submissionId, 'synced');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Google Drive Sync] Failed to sync submission ${submissionId}:`, err);
    updateSubmissionSyncStatus(submissionId, 'failed', message);
  }
}

async function syncDraftAgreements(link: LinkRow, folderName: string): Promise<void> {
  const draftDir = path.join(process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data', 'drafts', link.id);
  if (!fs.existsSync(draftDir)) return;

  const files = fs.readdirSync(draftDir);
  for (const fileName of files) {
    const filePath = path.join(draftDir, fileName);
    if (!fs.statSync(filePath).isFile()) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      const mimeType = fileName.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : fileName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
      const file = new File([buffer], fileName, { type: mimeType });
      await uploadFileToGAS({ folderName, fileName, documentType: 'draft_agreement', file });
    } catch (err) {
      console.error(`[Google Drive Sync] Failed to sync draft agreement ${fileName}:`, err);
    }
  }
}

async function uploadFileToGAS(params: {
  folderName: string;
  fileName: string;
  documentType: string;
  file: File;
}): Promise<{ fileId?: string } | null> {
  const arrayBuffer = await params.file.arrayBuffer();
  const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

  const response = await fetch(GAS_WEB_APP_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: GAS_API_KEY!,
      folderName: params.folderName,
      fileName: params.fileName,
      documentType: params.documentType,
      mimeType: params.file.type || 'application/octet-stream',
      fileBase64,
    }),
  });

  if (!response.ok) {
    throw new Error(`GAS upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`GAS rejected upload: ${result.error || 'unknown error'}. ` +
      `Make sure you re-deployed the Apps Script Web App after updating the code (Manage deployments → New version).`);
  }
  return result;
}
