'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { useDialog } from '@/components/Dialog';

interface VersionData {
  id: string;
  version_number: number;
  submitted_at: string;
  form_data: Record<string, string>;
  files: { id: string; document_type: string; original_name: string; display_name: string | null; mime_type: string; file_size: number }[];
}

interface SubmissionData {
  id: string;
  email: string;
  form_data: Record<string, string>;
  status: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  drive_sync_status: string;
  versions: VersionData[];
}

interface AddressVerification {
  status: 'pending' | 'matched' | 'mismatched' | 'failed' | 'skipped';
  user_address: string;
  extracted_address: string;
  reason: string;
  checked_at: string;
}

interface FileData {
  id: string;
  document_type: string;
  original_name: string;
  display_name: string | null;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  drive_sync_status: string;
  address_verification: AddressVerification | null;
  payment_extraction: { records: Array<{ amount: string; currency: string; date: string; payer: string }>; error?: string; checked_at?: string } | null;
}

interface LinkDetail {
  id: string;
  token: string;
  investor_name: string;
  investor_email: string | null;
  first_name: string | null;
  last_name: string | null;
  share_class: string | null;
  sequence_number: number | null;
  investor_type: string;
  expires_at: string;
  created_at: string;
  target_subscription_date: string | null;
  subscription_amount: string | null;
}

interface CertifiedCopy {
  id: string;
  link_id: string;
  source_file_ids: string[];
  display_name: string;
  file_size: number;
  certified_at: string;
  certified_by: string;
  drive_sync_status: string;
  drive_file_id: string | null;
}

interface DraftFile {
  name: string;
  size: number;
  mtime: string;
}

interface TimelineEvent {
  at: string;
  type: string;
  details: Record<string, unknown>;
}

const EVENT_META: Record<string, { label: string; color: string; icon: string }> = {
  link_created:         { label: 'Link created',              color: 'bg-gray-100 text-gray-700',       icon: '📝' },
  admin_edit:           { label: 'Admin edited details',      color: 'bg-yellow-100 text-yellow-800',   icon: '✏️' },
  invitation_sent:      { label: 'Invitation email sent',     color: 'bg-blue-100 text-blue-700',       icon: '✉️' },
  invitation_failed:    { label: 'Invitation email failed',   color: 'bg-red-100 text-red-700',         icon: '⚠️' },
  investor_first_login: { label: 'Investor first login',      color: 'bg-indigo-100 text-indigo-700',   icon: '🔑' },
  file_uploaded:        { label: 'File uploaded',             color: 'bg-sky-100 text-sky-700',         icon: '📎' },
  submission_version:   { label: 'Submission finalized',      color: 'bg-green-100 text-green-700',     icon: '✅' },
  drive_sync_success:   { label: 'Synced to Drive',           color: 'bg-emerald-100 text-emerald-700', icon: '☁️' },
  drive_sync_failed:    { label: 'Drive sync failed',         color: 'bg-red-100 text-red-700',         icon: '⚠️' },
  drive_folder_stale:   { label: 'Drive folder deleted',      color: 'bg-amber-100 text-amber-700',    icon: '⚠️' },
  drive_folder_resolved:{ label: 'Drive folder reassigned',   color: 'bg-emerald-100 text-emerald-700', icon: '📁' },
  payment_extracted:    { label: 'Payment info extracted',    color: 'bg-indigo-100 text-indigo-700',   icon: '💳' },
  drafts_generated:     { label: 'Draft agreements generated',color: 'bg-purple-100 text-purple-700',   icon: '📄' },
  address_verified:     { label: 'Address verification',     color: 'bg-teal-100 text-teal-700',       icon: '🏠' },
  certified_copy_generated: { label: 'Certified copy generated', color: 'bg-cyan-100 text-cyan-700', icon: '📜' },
  certified_copy_deleted:   { label: 'Certified copy deleted',   color: 'bg-gray-100 text-gray-700', icon: '🗑️' },
  certified_copy_synced:    { label: 'Certified copy synced',    color: 'bg-emerald-100 text-emerald-700', icon: '☁️' },
};

function renderEventDetail(ev: TimelineEvent): string {
  const d = ev.details;
  switch (ev.type) {
    case 'invitation_sent': return typeof d.email === 'string' ? `to ${d.email}` : '';
    case 'invitation_failed': return `to ${d.email || '?'} — ${d.error || 'unknown error'}`;
    case 'investor_first_login': return typeof d.email === 'string' ? d.email : '';
    case 'file_uploaded': return `${d.name || '?'} (${d.documentType || ''})`;
    case 'submission_version': return `v${d.versionNumber} · ${d.fileCount} file${d.fileCount === 1 ? '' : 's'}${d.email ? ' · ' + d.email : ''}`;
    case 'drive_sync_success': return d.force ? 'force re-sync' : '';
    case 'drive_sync_failed': return String(d.error || 'unknown error');
    case 'drafts_generated': {
      const gen = Array.isArray(d.generated) ? (d.generated as string[]) : [];
      const errs = Array.isArray(d.errors) ? (d.errors as unknown[]) : [];
      const parts: string[] = [];
      if (gen.length) parts.push(`${gen.length} file${gen.length === 1 ? '' : 's'}`);
      if (errs.length) parts.push(`${errs.length} error${errs.length === 1 ? '' : 's'}`);
      return parts.join(', ');
    }
    case 'admin_edit': {
      const changes = (d.changes as Record<string, { from: unknown; to: unknown }>) || {};
      return Object.keys(changes).map(k => `${k}: ${formatVal(changes[k].from)} → ${formatVal(changes[k].to)}`).join('; ');
    }
    case 'address_verified': return `${d.status || '?'}${d.reason ? ' — ' + d.reason : ''}`;
    case 'payment_extracted': return `${d.records} record${d.records === 1 ? '' : 's'}${d.error ? ' — ' + d.error : ''}`;
    case 'drive_folder_stale': return String(d.message || 'Original folder was deleted');
    case 'drive_folder_resolved': return d.folderId ? `Linked to folder ${d.folderId}` : 'New folder will be created';
    case 'certified_copy_generated': return `${d.displayName || '?'} (${d.sourceCount} file${d.sourceCount === 1 ? '' : 's'})`;
    case 'certified_copy_deleted': return String(d.displayName || '');
    case 'certified_copy_synced': return String(d.displayName || '');
    default: return '';
  }
}

function formatVal(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}

/** SQLite stores datetimes as "YYYY-MM-DD HH:MM:SS" in UTC. Make JS parse it as UTC. */
function parseSqliteTs(s: string): Date {
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

const SHARE_CLASSES = ['Class E', 'Class MM', 'Class A', 'Class B'];

function buildLinkTag(firstName: string | null, lastName: string | null): string {
  const f = (firstName || '').trim().toLowerCase();
  const l = (lastName || '').trim().toLowerCase();
  if (!f || !l) return '';
  return `${f.charAt(0)}${l}`;
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

interface EmploymentEntry {
  employerName?: string;
  natureOfBusiness?: string;
  startYear?: string;
  startMonth?: string;
  endYear?: string;
  endMonth?: string;
}

function parseEmploymentHistory(raw: string): EmploymentEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as EmploymentEntry[];
  } catch {
    // not JSON
  }
  return null;
}

function formatPeriod(entry: EmploymentEntry): string {
  const start = entry.startYear && entry.startMonth
    ? `${entry.startYear}-${entry.startMonth}`
    : entry.startYear || '?';
  const end = entry.endYear && entry.endMonth
    ? `${entry.endYear}-${entry.endMonth}`
    : entry.endYear || 'Present';
  return `${start} – ${end}`;
}

export default function LinkDetailPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const [link, setLink] = useState<LinkDetail | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const [certifiedCopies, setCertifiedCopies] = useState<CertifiedCopy[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [draftResult, setDraftResult] = useState<string | null>(null);
  const [generatingCert, setGeneratingCert] = useState(false);
  const [certifyingFile, setCertifyingFile] = useState<string | null>(null);
  const [certResult, setCertResult] = useState<string | null>(null);
  const [syncingCert, setSyncingCert] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editShareClass, setEditShareClass] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editSubAmount, setEditSubAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Copy / resend state
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string; mimeType: string } | null>(null);
  const autoVerifyTriggered = useRef(false);
  const { confirm, alert } = useDialog();

  const fetchData = useCallback(async () => {
    try {
      const [submRes, draftRes] = await Promise.all([
        fetch(`/api/admin/submissions?linkId=${linkId}`),
        fetch(`/api/admin/generate-drafts?linkId=${linkId}`),
      ]);
      if (submRes.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await submRes.json();
      setLink(data.link);
      setSubmissions(data.submissions);
      setFiles(data.files);
      setTimeline(data.timeline || []);
      setCertifiedCopies(data.certifiedCopies || []);
      if (draftRes.ok) {
        const draftData = await draftRes.json();
        setDrafts(draftData.files || []);
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-trigger address verification when page loads with unverified address proof
  useEffect(() => {
    if (autoVerifyTriggered.current || loading || verifyingAddress) return;
    const addressProof = files.find(f => f.document_type === 'address_proof');
    if (!addressProof || addressProof.address_verification) return;
    const hasAddress = submissions[0]?.form_data?.residentialAddress;
    if (!hasAddress) return;
    autoVerifyTriggered.current = true;
    handleReVerifyAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, files, submissions]);

  const [folderConflict, setFolderConflict] = useState<{
    message: string;
    expectedName: string;
    similarFolders: Array<{ id: string; name: string; url: string }>;
    force: boolean;
  } | null>(null);

  const handleSyncToDrive = async (force = false, resolvedFolderId?: string) => {
    setSyncing(true);
    setSyncResult(null);
    setFolderConflict(null);
    try {
      const res = await fetch('/api/admin/sync-to-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, force, resolvedFolderId }),
      });
      const data = await res.json();

      if (data.folderConflict) {
        setFolderConflict({
          message: data.message,
          expectedName: data.expectedName,
          similarFolders: data.similarFolders || [],
          force,
        });
        setSyncing(false);
        return;
      }

      if (!res.ok) throw new Error(data.error);
      setSyncResult(force ? 'Force re-sync complete' : 'Successfully synced to Google Drive');
      fetchData();
    } catch (err) {
      setSyncResult(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const startEditing = () => {
    if (!link) return;
    setEditFirst(link.first_name || '');
    setEditLast(link.last_name || '');
    setEditShareClass(link.share_class || '');
    setEditEmail(link.investor_email || '');
    setEditTargetDate(link.target_subscription_date || '');
    setEditSubAmount(link.subscription_amount || '');
    setSaveError(null);
    setEditing(true);
  };

  const handleSaveLink = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirst,
          lastName: editLast,
          shareClass: editShareClass || null,
          investorEmail: editEmail || null,
          targetSubscriptionDate: editTargetDate || null,
          subscriptionAmount: editSubAmount || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(false);
      fetchData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResendInvitation = async () => {
    setResending(true);
    setResendResult(null);
    try {
      const res = await fetch('/api/admin/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResendResult('Invitation email sent');
    } catch (err) {
      setResendResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResending(false);
    }
  };

  const handleReVerifyAddress = async () => {
    setVerifyingAddress(true);
    try {
      const res = await fetch('/api/admin/verify-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      const data = await res.json();
      if (!res.ok) {
        await alert({
          title: 'Verification failed',
          message: data.error || 'Unknown error',
          variant: 'error',
        });
        return;
      }
      fetchData();
    } finally {
      setVerifyingAddress(false);
    }
  };

  const handleDeleteLink = async () => {
    if (!link) return;
    const ok = await confirm({
      title: `Delete ${link.investor_name}?`,
      message: 'This removes the submission link, form data, and locally stored files from this portal.\n\nGoogle Drive files will NOT be affected.',
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/links/${linkId}`, { method: 'DELETE' });
      const data = res.status !== 204 ? await res.json().catch(() => ({})) : {};
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      window.location.href = '/admin';
    } catch (err) {
      await alert({
        title: 'Failed to delete',
        message: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'error',
      });
      setDeleting(false);
    }
  };

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    setDraftResult(null);
    try {
      const res = await fetch('/api/admin/generate-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const successCount = data.generated?.length || 0;
      const errorCount = data.errors?.length || 0;
      setDraftResult(
        errorCount > 0
          ? `Generated ${successCount}; ${errorCount} failed: ${data.errors.map((e: { kind: string; error: string }) => `${e.kind}: ${e.error}`).join('; ')}`
          : `Generated ${successCount} draft agreement(s)`
      );
      fetchData();
    } catch (err) {
      setDraftResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeneratingDrafts(false);
    }
  };

  const handleGenerateCertifiedCopy = async (fileId?: string) => {
    if (fileId) {
      setCertifyingFile(fileId);
    } else {
      setGeneratingCert(true);
    }
    setCertResult(null);
    try {
      const res = await fetch('/api/admin/certify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, fileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const count = data.generated?.length || 0;
      const errCount = data.errors?.length || 0;
      setCertResult(
        errCount > 0
          ? `Generated ${count}, ${errCount} failed`
          : `Generated ${count} certified cop${count === 1 ? 'y' : 'ies'}`
      );
      fetchData();
    } catch (err) {
      setCertResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeneratingCert(false);
      setCertifyingFile(null);
    }
  };

  const handleDeleteCertifiedCopy = async (certId: string) => {
    const ok = await confirm({
      title: 'Delete certified copy?',
      message: 'This will permanently delete the generated certified copy PDF.',
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/certified/${certId}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch { /* ignore */ }
  };

  const handleSyncCertifiedCopy = async (certId: string) => {
    setSyncingCert(certId);
    try {
      const res = await fetch(`/api/admin/certified/${certId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchData();
    } catch (err) {
      await alert({
        title: 'Sync failed',
        message: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setSyncingCert(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!link) return <div className="p-8 text-red-500">Link not found</div>;

  const latestSubmission = submissions[0];
  const currentFormData = latestSubmission?.form_data || {};
  const versions = latestSubmission?.versions || [];

  // Latest address proof + its verification state (for the Address Verification card)
  const latestAddressProof = files
    .filter(f => f.document_type === 'address_proof')
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0];
  const addressVerification = latestAddressProof?.address_verification || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin" className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
          <h1 className="text-xl font-bold text-gray-900">{link.investor_name}</h1>
          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded capitalize">{link.investor_type}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Investor metadata + actions */}
        <div className="bg-white rounded-lg shadow p-6">
          {editing ? (
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">First Name</label>
                  <input
                    type="text"
                    value={editFirst}
                    onChange={e => setEditFirst(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="e.g. Jin"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editLast}
                    onChange={e => setEditLast(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="e.g. ZHANG"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Share Class</label>
                  <select
                    value={editShareClass}
                    onChange={e => setEditShareClass(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="">— None —</option>
                    {SHARE_CLASSES.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Target Date</label>
                  <input
                    type="date"
                    value={editTargetDate}
                    onChange={e => setEditTargetDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Amount (USD)</label>
                  <input
                    type="text"
                    value={editSubAmount}
                    onChange={e => setEditSubAmount(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="e.g. 100000"
                  />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="text-xs text-gray-500 block mb-1">Investor Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="investor@example.com"
                  />
                </div>
              </div>
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveLink}
                  disabled={saving}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-gray-600 px-3 py-1.5 rounded text-sm border hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">First / Last Name</p>
                  <p className="font-medium text-gray-900">
                    {link.first_name || '?'} / {link.last_name || '?'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Share Class</p>
                  <p className="font-medium text-gray-900">{link.share_class || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Target Date</p>
                  <p className="font-medium text-gray-900">{link.target_subscription_date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Amount (USD)</p>
                  <p className="font-medium text-gray-900">
                    {link.subscription_amount ? `$${Number(link.subscription_amount.replace(/[^0-9.]/g, '')).toLocaleString()}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Drive Folder</p>
                  <p className="font-medium text-gray-900 text-xs">
                    {link.first_name && link.last_name
                      ? `${link.last_name.toUpperCase()} ${link.first_name}`
                      : '-'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Investor Email</p>
                  <p className="font-medium text-gray-900 break-all">{link.investor_email || <span className="text-gray-400">(none)</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Unique Submission Link</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border rounded px-2 py-1 text-xs text-gray-700 break-all">
                      {(() => { const tag = buildLinkTag(link.first_name, link.last_name); const base = typeof window !== 'undefined' ? `${window.location.origin}/submit/${link.token}` : `/submit/${link.token}`; return tag ? `${base}?n=${tag}` : base; })()}
                    </code>
                    <button
                      onClick={() => { const tag = buildLinkTag(link.first_name, link.last_name); const base = `${window.location.origin}/submit/${link.token}`; handleCopy(tag ? `${base}?n=${tag}` : base); }}
                      className={`p-2 rounded-lg border transition-colors ${copied ? 'bg-green-100 border-green-300 text-green-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                      title={copied ? 'Copied!' : 'Copy to clipboard'}
                    >
                      {copied ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            {!editing && (
              <button
                onClick={startEditing}
                className="text-gray-600 border px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Edit Details
              </button>
            )}
            <a
              href={`/submit/${link.token}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 border px-4 py-2 rounded-lg text-sm hover:bg-gray-50 inline-flex items-center gap-1"
            >
              Preview Form
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <button
              onClick={handleResendInvitation}
              disabled={resending || !link.investor_email}
              className="border border-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              title={!link.investor_email ? 'Add an investor email first' : 'Resend invitation email'}
            >
              {resending ? 'Sending...' : 'Resend Invitation'}
            </button>
            <button
              onClick={() => handleSyncToDrive(false)}
              disabled={syncing || !latestSubmission}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync to Drive'}
            </button>
            <button
              onClick={() => handleSyncToDrive(true)}
              disabled={syncing || !latestSubmission}
              className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Force Re-sync'}
            </button>
            <button
              onClick={handleGenerateDrafts}
              disabled={generatingDrafts || !latestSubmission}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              {generatingDrafts ? 'Generating...' : 'Generate Draft Agreements'}
            </button>
            <button
              onClick={handleDeleteLink}
              disabled={deleting}
              className="ml-auto border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
              title="Delete this investor entry and all associated data"
            >
              {deleting ? 'Deleting...' : 'Delete Investor Entry'}
            </button>
          </div>
          {resendResult && <p className="mt-2 text-xs text-gray-600">{resendResult}</p>}
          {syncResult && <p className="mt-2 text-xs text-gray-600">{syncResult}</p>}
          {draftResult && <p className="mt-2 text-xs text-gray-600">{draftResult}</p>}

          {/* Folder conflict resolution dialog */}
          {folderConflict && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">{folderConflict.message}</p>
                  <p className="text-xs text-amber-700 mt-1">Expected folder name: <strong>{folderConflict.expectedName}</strong></p>
                </div>
              </div>

              {folderConflict.similarFolders.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-700 font-medium mb-2">Similar folders found — choose one to use:</p>
                  <div className="space-y-1">
                    {folderConflict.similarFolders.map(f => (
                      <div key={f.id} className="flex items-center gap-2 bg-white border rounded px-3 py-2">
                        <span className="text-sm text-gray-900 flex-1">{f.name}</span>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800" onClick={e => e.stopPropagation()}>Open</a>
                        <button
                          onClick={() => handleSyncToDrive(folderConflict.force, f.id)}
                          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Use this folder
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleSyncToDrive(folderConflict.force, '')}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Create new folder ({folderConflict.expectedName})
                </button>
                <button
                  onClick={() => setFolderConflict(null)}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
            <span className="text-xs text-gray-500">{timeline.length} event{timeline.length === 1 ? '' : 's'}</span>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <ol className="relative border-l-2 border-gray-200 ml-2 space-y-3">
              {timeline.map((ev, i) => {
                const meta = EVENT_META[ev.type] || { label: ev.type, color: 'bg-gray-100 text-gray-700', icon: '•' };
                const detail = renderEventDetail(ev);
                const actor = typeof ev.details?.actor === 'string' ? ev.details.actor : null;
                return (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[11px] w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-[10px]">
                      {meta.icon}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-gray-500">{parseSqliteTs(ev.at).toLocaleString()}</span>
                      {actor && <span className="text-xs text-indigo-600 font-medium">by {actor}</span>}
                    </div>
                    {detail && <p className="text-xs text-gray-600 mt-0.5 break-all">{detail}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Address verification card — always shown when address_proof exists */}
        {latestAddressProof && (() => {
          const v = addressVerification;
          const status = v?.status;
          const palette = (() => {
            switch (status) {
              case 'matched':    return { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  sub: 'text-green-700',  label: 'text-green-600', icon: 'text-green-600', badge: 'bg-green-100 text-green-700',   title: 'Address matches' };
              case 'mismatched': return { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    sub: 'text-red-700',    label: 'text-red-500',   icon: 'text-red-600',   badge: 'bg-red-100 text-red-700',       title: 'Address does NOT match' };
              case 'pending':    return { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   sub: 'text-blue-700',   label: 'text-blue-500',  icon: 'text-blue-600',  badge: 'bg-blue-100 text-blue-700',     title: 'Verifying…' };
              case 'failed':     return { bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-800',  sub: 'text-amber-700',  label: 'text-amber-500', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700',   title: 'Verification failed' };
              case 'skipped':    return { bg: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-800',   sub: 'text-gray-600',   label: 'text-gray-500',  icon: 'text-gray-600',  badge: 'bg-gray-100 text-gray-700',     title: 'Verification skipped' };
              default:           return { bg: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-800',   sub: 'text-gray-600',   label: 'text-gray-500',  icon: 'text-gray-600',  badge: 'bg-gray-100 text-gray-700',     title: 'Not verified yet' };
            }
          })();

          const iconPath = (() => {
            if (status === 'matched')    return 'M5 13l4 4L19 7';
            if (status === 'mismatched') return 'M6 18L18 6M6 6l12 12';
            if (status === 'pending')    return 'M12 8v4l2 2';
            return 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z';
          })();

          return (
            <div className={`${palette.bg} border ${palette.border} rounded-lg p-4`}>
              <div className="flex items-start gap-3">
                <svg className={`w-6 h-6 flex-shrink-0 mt-0.5 ${palette.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className={`text-sm font-semibold ${palette.text}`}>Address Verification — {palette.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${palette.badge}`}>{status || 'not run'}</span>
                    <button
                      onClick={handleReVerifyAddress}
                      disabled={verifyingAddress}
                      className="ml-auto text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      {verifyingAddress ? 'Verifying…' : 'Re-verify'}
                    </button>
                  </div>

                  {v && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className={`p-3 bg-white rounded border ${palette.border}`}>
                        <p className={`text-xs uppercase tracking-wide ${palette.label}`}>User entered</p>
                        <p className={`text-sm mt-1 break-words ${palette.text}`}>{v.user_address || '(empty)'}</p>
                      </div>
                      <div className={`p-3 bg-white rounded border ${palette.border}`}>
                        <p className={`text-xs uppercase tracking-wide ${palette.label}`}>Extracted from document</p>
                        <p className={`text-sm mt-1 break-words ${palette.text}`}>{v.extracted_address || '(not found)'}</p>
                      </div>
                    </div>
                  )}

                  {v?.reason && (
                    <p className={`text-xs mt-3 ${palette.sub}`}>{v.reason}</p>
                  )}
                  <p className={`text-xs mt-2 ${palette.label}`}>
                    Document: <span className="font-mono">{latestAddressProof.display_name || latestAddressProof.original_name}</span>
                    {v?.checked_at && <> &middot; Checked {new Date(v.checked_at).toLocaleString()}</>}
                    {!v && <> &middot; No check run yet — click Re-verify</>}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Draft Agreements */}
        {drafts.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Draft Agreements ({drafts.length})</h2>
            <div className="space-y-2">
              {drafts.map((d) => (
                <div key={d.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatSize(d.size)} &middot; Generated {new Date(d.mtime).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.name.endsWith('.pdf') && (
                      <button
                        onClick={() => setPreviewFile({ id: `draft:${linkId}/${encodeURIComponent(d.name)}`, name: d.name, mimeType: 'application/pdf' })}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Preview
                      </button>
                    )}
                    <a
                      href={`/api/admin/drafts/${linkId}/${encodeURIComponent(d.name)}`}
                      className="text-sm text-gray-500 hover:text-gray-700"
                      download
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certified True Copies */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Certified True Copies
              {certifiedCopies.length > 0 && <span className="text-sm font-normal text-gray-500 ml-2">({certifiedCopies.length})</span>}
            </h2>
            <button
              onClick={() => handleGenerateCertifiedCopy()}
              disabled={generatingCert || files.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {generatingCert ? (
                <>Generating...</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Certify All Documents
                </>
              )}
            </button>
          </div>
          {certResult && <p className="text-xs text-gray-600 mb-3">{certResult}</p>}
          {certifiedCopies.length === 0 ? (
            <p className="text-sm text-gray-500">No certified copies generated yet. Upload non-identity documents first, then click "Generate Certified True Copy" to create a certified PDF.</p>
          ) : (
            <div className="space-y-2">
              {certifiedCopies.map((copy) => (
                <div key={copy.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{copy.display_name}</p>
                    <p className="text-xs text-gray-500">
                      {formatSize(copy.file_size)} &middot;
                      Certified {new Date(copy.certified_at.includes('T') ? copy.certified_at : copy.certified_at.replace(' ', 'T') + 'Z').toLocaleString()}
                      &middot; by {copy.certified_by}
                      &middot; {copy.source_file_ids.length} source file{copy.source_file_ids.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      copy.drive_sync_status === 'synced' ? 'bg-green-100 text-green-700' :
                      copy.drive_sync_status === 'syncing' ? 'bg-blue-100 text-blue-700' :
                      copy.drive_sync_status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {copy.drive_sync_status}
                    </span>
                    <button
                      onClick={() => setPreviewFile({ id: `cert:${copy.id}`, name: copy.display_name, mimeType: 'application/pdf' })}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Preview
                    </button>
                    <a
                      href={`/api/admin/certified/${copy.id}`}
                      className="text-sm text-gray-500 hover:text-gray-700"
                      download
                    >
                      Download
                    </a>
                    <button
                      onClick={() => handleSyncCertifiedCopy(copy.id)}
                      disabled={syncingCert === copy.id}
                      className="text-sm text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                    >
                      {syncingCert === copy.id ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                      onClick={() => handleDeleteCertifiedCopy(copy.id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Form Data */}
        {latestSubmission && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Current Form Data (Live Draft)</h2>
              <div className="flex gap-2">
                <span className={`px-2 py-0.5 text-xs rounded ${
                  latestSubmission.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {latestSubmission.status}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded ${
                  latestSubmission.drive_sync_status === 'synced' ? 'bg-green-100 text-green-700' :
                  latestSubmission.drive_sync_status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  sync: {latestSubmission.drive_sync_status}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">Last updated: {new Date(latestSubmission.updated_at).toLocaleString()}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(currentFormData).map(([key, value]) => {
                if (key === 'employmentHistory') {
                  const entries = parseEmploymentHistory(value);
                  return (
                    <div key={key} className="md:col-span-2 border-b pb-2">
                      <p className="text-xs text-gray-500 mb-2">{formatFieldName(key)}</p>
                      {entries && entries.length > 0 ? (
                        <div className="space-y-2">
                          {entries.map((entry, idx) => (
                            <div key={idx} className="bg-gray-50 border rounded p-2 text-sm">
                              <p className="font-medium text-gray-900">
                                {idx + 1}. {entry.employerName || '?'}
                                {entry.natureOfBusiness && <span className="text-gray-600 font-normal"> — {entry.natureOfBusiness}</span>}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{formatPeriod(entry)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900">{value || '-'}</p>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={key} className="border-b pb-2">
                    <p className="text-xs text-gray-500">{formatFieldName(key)}</p>
                    <p className="text-sm text-gray-900">{value || '-'}</p>
                  </div>
                );
              })}
            </div>
            {latestSubmission.status === 'finalized' && (
              <div className="mt-4 pt-4 border-t">
                <Link
                  href={`/admin/contracts?submissionId=${latestSubmission.id}&investorType=${link.investor_type}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Generate Contract from this submission &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Version History */}
        {versions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Submission History ({versions.length} {versions.length === 1 ? 'version' : 'versions'})
            </h2>
            <div className="space-y-2">
              {versions.map((version) => {
                const isExpanded = expandedVersion === version.id;
                return (
                  <div key={version.id} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                          v{version.version_number}
                        </span>
                        <span className="text-sm text-gray-900">
                          {new Date(version.submitted_at).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {version.files.length} file{version.files.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-4 space-y-4">
                        <div>
                          <h3 className="text-xs font-medium text-gray-700 mb-2">Form Data</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white p-3 rounded border">
                            {Object.entries(version.form_data).map(([key, value]) => {
                              if (key === 'employmentHistory') {
                                const entries = parseEmploymentHistory(value);
                                return (
                                  <div key={key} className="md:col-span-2 border-b pb-1 last:border-b-0">
                                    <p className="text-xs text-gray-500 mb-1">{formatFieldName(key)}</p>
                                    {entries && entries.length > 0 ? (
                                      <div className="space-y-1">
                                        {entries.map((entry, idx) => (
                                          <div key={idx} className="text-xs text-gray-800">
                                            {idx + 1}. {entry.employerName || '?'}
                                            {entry.natureOfBusiness && ` — ${entry.natureOfBusiness}`}
                                            <span className="text-gray-500"> ({formatPeriod(entry)})</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-900">{value || '-'}</p>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div key={key} className="border-b pb-1 last:border-b-0">
                                  <p className="text-xs text-gray-500">{formatFieldName(key)}</p>
                                  <p className="text-sm text-gray-900">{value || '-'}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {version.files.length > 0 && (
                          <div>
                            <h3 className="text-xs font-medium text-gray-700 mb-2">Files at this version</h3>
                            <div className="space-y-1">
                              {version.files.map(f => (
                                <div key={f.id} className="flex items-center justify-between bg-white p-2 rounded border text-xs">
                                  <span className="text-gray-900">{f.display_name || f.original_name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">{f.document_type}</span>
                                    <span className="text-gray-400">{formatSize(f.file_size)}</span>
                                    <button onClick={() => setPreviewFile({ id: f.id, name: f.display_name || f.original_name, mimeType: f.mime_type })} className="text-blue-600 hover:text-blue-800">Preview</button>
                                    <a href={`/api/admin/files/${f.id}`} download className="text-gray-500 hover:text-gray-700">Download</a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Uploaded Files (current) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">All Uploaded Documents ({files.length})</h2>
          {files.length === 0 ? (
            <p className="text-gray-500 text-sm">No files uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const av = file.address_verification;
                const rowBg = av?.status === 'mismatched' ? 'bg-red-50 border border-red-200'
                  : av?.status === 'matched' ? 'bg-green-50 border border-green-200'
                  : av?.status === 'pending' ? 'bg-blue-50 border border-blue-200'
                  : av?.status === 'failed' ? 'bg-amber-50 border border-amber-200'
                  : 'bg-gray-50';
                return (
                <div key={file.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg ${rowBg}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {file.display_name || file.original_name}
                      {av?.status === 'mismatched' && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          Address mismatch
                        </span>
                      )}
                      {av?.status === 'matched' && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Address matched
                        </span>
                      )}
                      {av?.status === 'pending' && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Verifying…</span>
                      )}
                      {av?.status === 'failed' && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">Verification failed</span>
                      )}
                      {av?.status === 'skipped' && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">Skipped</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {file.document_type} &middot; {formatSize(file.file_size)} &middot; {new Date(file.uploaded_at).toLocaleString()}
                      {file.display_name && file.display_name !== file.original_name && (
                        <span className="ml-2 text-gray-400">(uploaded as: {file.original_name})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      file.drive_sync_status === 'synced' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {file.drive_sync_status}
                    </span>
                    <button
                      onClick={() => handleGenerateCertifiedCopy(file.id)}
                      disabled={certifyingFile === file.id}
                      className="text-sm text-cyan-600 hover:text-cyan-800 disabled:opacity-50"
                    >
                      {certifyingFile === file.id ? 'Certifying...' : 'Certify'}
                    </button>
                    <button
                      onClick={() => setPreviewFile({ id: file.id, name: file.display_name || file.original_name, mimeType: file.mime_type })}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Preview
                    </button>
                    <a
                      href={`/api/admin/files/${file.id}`}
                      className="text-sm text-gray-500 hover:text-gray-700"
                      download
                    >
                      Download
                    </a>
                  </div>

                  {/* Payment extraction results */}
                  {file.document_type === 'payment_proof' && (
                    <div className="mt-2 w-full">
                      {file.payment_extraction?.records && file.payment_extraction.records.length > 0 ? (
                        <div className="bg-white border border-green-200 rounded p-3 space-y-2">
                          <p className="text-xs font-medium text-green-700">Extracted Payment Info:</p>
                          {file.payment_extraction.records.map((r, ri) => (
                            <div key={ri} className="flex flex-wrap gap-4 text-xs text-gray-700 bg-green-50 rounded px-2 py-1.5">
                              <span><strong>Amount:</strong> {r.currency} {r.amount}</span>
                              <span><strong>Date:</strong> {r.date}</span>
                              <span><strong>Payer:</strong> {r.payer}</span>
                            </div>
                          ))}
                          {file.payment_extraction.checked_at && <p className="text-[10px] text-gray-400">Checked: {new Date(file.payment_extraction.checked_at).toLocaleString()}</p>}
                        </div>
                      ) : file.payment_extraction?.error ? (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">{file.payment_extraction.error}</p>
                      ) : null}
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/admin/extract-payment', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ fileId: file.id }),
                            });
                            if (res.ok) fetchData();
                          } catch { /* ignore */ }
                        }}
                        className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        {file.payment_extraction ? 'Re-extract payment info' : 'Extract payment info'}
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* Admin upload payment proof */}
          <div className="mt-4">
            <input
              id="admin-payment-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !link) return;
                const fd = new FormData();
                fd.append('file', file);
                fd.append('token', link.token);
                fd.append('documentType', 'payment_proof');
                fd.append('adminUpload', '1');
                try {
                  const res = await fetch('/api/admin/upload-file', {
                    method: 'POST',
                    body: fd,
                  });
                  if (res.ok) fetchData();
                } catch { /* ignore */ }
                e.target.value = '';
              }}
            />
            <button
              onClick={() => document.getElementById('admin-payment-upload')?.click()}
              className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Upload Payment Proof (Admin)
            </button>
          </div>
        </div>
      </div>

      {/* File preview modal */}
      {previewFile && (() => {
        const isDraft = previewFile.id.startsWith('draft:');
        const isCert = previewFile.id.startsWith('cert:');
        const url = isDraft
          ? `/api/admin/drafts/${previewFile.id.slice(6)}?inline=1`
          : isCert
          ? `/api/admin/certified/${previewFile.id.slice(5)}?inline=1`
          : `/api/admin/files/${previewFile.id}?inline=1`;
        const downloadUrl = isDraft
          ? `/api/admin/drafts/${previewFile.id.slice(6)}`
          : isCert
          ? `/api/admin/certified/${previewFile.id.slice(5)}`
          : `/api/admin/files/${previewFile.id}`;
        const isImage = previewFile.mimeType.startsWith('image/');
        const isPdf = previewFile.mimeType === 'application/pdf';
        const canPreview = isImage || isPdf;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setPreviewFile(null)}
          >
            <div
              className="bg-white rounded-lg shadow-2xl flex flex-col max-h-[90vh] w-full max-w-5xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-4 py-3 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{previewFile.name}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={downloadUrl}
                    download
                    className="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => setPreviewFile(null)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100 min-h-[60vh]">
                {isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={previewFile.name} className="max-w-full max-h-[80vh] object-contain" />
                )}
                {isPdf && (
                  <iframe src={url} className="w-full h-[80vh] border-0" title={previewFile.name} />
                )}
                {!canPreview && (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg mb-2">Preview not available</p>
                    <p className="text-sm">{previewFile.mimeType}</p>
                    <a href={downloadUrl} download className="mt-4 inline-block text-blue-600 hover:text-blue-800">
                      Download file
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
