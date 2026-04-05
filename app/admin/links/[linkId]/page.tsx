'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';

interface VersionData {
  id: string;
  version_number: number;
  submitted_at: string;
  form_data: Record<string, string>;
  files: { id: string; document_type: string; original_name: string; file_size: number }[];
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

interface FileData {
  id: string;
  document_type: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  drive_sync_status: string;
}

interface LinkDetail {
  id: string;
  investor_name: string;
  investor_type: string;
  expires_at: string;
  created_at: string;
}

export default function LinkDetailPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const [link, setLink] = useState<LinkDetail | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/submissions?linkId=${linkId}`);
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      setLink(data.link);
      setSubmissions(data.submissions);
      setFiles(data.files);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!link) return <div className="p-8 text-red-500">Link not found</div>;

  const latestSubmission = submissions[0];
  const currentFormData = latestSubmission?.form_data || {};
  const versions = latestSubmission?.versions || [];

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
              {Object.entries(currentFormData).map(([key, value]) => (
                <div key={key} className="border-b pb-2">
                  <p className="text-xs text-gray-500">{key}</p>
                  <p className="text-sm text-gray-900">{value || '-'}</p>
                </div>
              ))}
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
                            {Object.entries(version.form_data).map(([key, value]) => (
                              <div key={key} className="border-b pb-1 last:border-b-0">
                                <p className="text-xs text-gray-500">{key}</p>
                                <p className="text-sm text-gray-900">{value || '-'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {version.files.length > 0 && (
                          <div>
                            <h3 className="text-xs font-medium text-gray-700 mb-2">Files at this version</h3>
                            <div className="space-y-1">
                              {version.files.map(f => (
                                <div key={f.id} className="flex items-center justify-between bg-white p-2 rounded border text-xs">
                                  <span className="text-gray-900">{f.original_name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">{f.document_type}</span>
                                    <span className="text-gray-400">{formatSize(f.file_size)}</span>
                                    <a href={`/api/admin/files/${f.id}`} download className="text-blue-600 hover:text-blue-800">Download</a>
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
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.original_name}</p>
                    <p className="text-xs text-gray-500">
                      {file.document_type} &middot; {formatSize(file.file_size)} &middot; {new Date(file.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      file.drive_sync_status === 'synced' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {file.drive_sync_status}
                    </span>
                    <a
                      href={`/api/admin/files/${file.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                      download
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
