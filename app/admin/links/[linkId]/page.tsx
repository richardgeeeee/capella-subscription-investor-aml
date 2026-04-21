'use client';

import { useState, useEffect, useCallback, use } from 'react';
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
  drafts_generated:     { label: 'Draft agreements generated',color: 'bg-purple-100 text-purple-700',   icon: '📄' },
  address_verified:     { label: 'Address verification',     color: 'bg-teal-100 text-teal-700',       icon: '🏠' },
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
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [draftResult, setDraftResult] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editSeq, setEditSeq] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editShareClass, setEditShareClass] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Copy / resend state
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string; mimeType: string } | null>(null);
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

  const handleSyncToDrive = async (force = false) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-to-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, force }),
      });
      const data = await res.json();
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
    setEditSeq(link.sequence_number ? String(link.sequence_number) : '');
    setEditFirst(link.first_name || '');
    setEditLast(link.last_name || '');
    setEditShareClass(link.share_class || '');
    setEditEmail(link.investor_email || '');
    setSaveError(null);
    setEditing(true);
  };

  const handleSaveLink = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const seq = editSeq ? parseInt(editSeq, 10) : undefined;
      if (editSeq && (isNaN(seq!) || seq! <= 0)) {
        setSaveError('Sequence must be a positive integer');
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/admin/links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirst,
          lastName: editLast,
          sequenceNumber: seq,
          shareClass: editShareClass || null,
          investorEmail: editEmail || null,
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
    const seq = link.sequence_number ? `#${String(link.sequence_number).padStart(3, '0')} ` : '';
    const ok = await confirm({
      title: `Delete ${seq}${link.investor_name}?`,
      message: `This permanently removes the link, all submissions, uploaded files, and generated drafts. Sequence ${link.sequence_number ?? ''} will be reused for the next new investor.\n\nThis cannot be undone.`,
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
                  <label className="text-xs text-gray-500 block mb-1">Sequence #</label>
                  <input
                    type="number"
                    value={editSeq}
                    onChange={e => setEditSeq(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="e.g. 53"
                    min={1}
                  />
                </div>
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
                  <p className="text-xs text-gray-500">Sequence</p>
                  <p className="font-medium text-gray-900">
                    {link.sequence_number ? String(link.sequence_number).padStart(3, '0') : '-'}
                  </p>
                </div>
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
                  <p className="text-xs text-gray-500">Drive Folder</p>
                  <p className="font-medium text-gray-900 text-xs">
                    {link.sequence_number && link.first_name && link.last_name
                      ? `${String(link.sequence_number).padStart(3, '0')} ${link.last_name.toUpperCase()} ${link.first_name}`
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
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
            {!editing && (
              <button
                onClick={startEditing}
                className="text-gray-600 border px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Edit Details
              </button>
            )}
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
                return (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[11px] w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-[10px]">
                      {meta.icon}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-gray-500">{parseSqliteTs(ev.at).toLocaleString()}</span>
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
                <div key={file.id} className={`flex items-center justify-between p-3 rounded-lg ${rowBg}`}>
                  <div>
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
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* File preview modal */}
      {previewFile && (() => {
        const isDraft = previewFile.id.startsWith('draft:');
        const url = isDraft
          ? `/api/admin/drafts/${previewFile.id.slice(6)}?inline=1`
          : `/api/admin/files/${previewFile.id}?inline=1`;
        const downloadUrl = isDraft
          ? `/api/admin/drafts/${previewFile.id.slice(6)}`
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
