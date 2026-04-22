'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDialog } from '@/components/Dialog';

const SHARE_CLASSES = ['Class E', 'Class MM', 'Class A', 'Class B'];

interface ClassDoc {
  id: string;
  share_class: string;
  name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  sort_order: number;
  created_at: string;
}

export default function ClassDocumentsPage() {
  const [selectedClass, setSelectedClass] = useState(SHARE_CLASSES[0]);
  const [docs, setDocs] = useState<ClassDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string; mimeType: string } | null>(null);

  const { confirm, alert } = useDialog();

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/class-documents?shareClass=${encodeURIComponent(selectedClass)}`);
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
      const data = await res.json();
      setDocs(data.documents || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('shareClass', selectedClass);
      fd.append('name', uploadName);
      fd.append('file', uploadFile);
      const res = await fetch('/api/admin/class-documents', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowUpload(false);
      setUploadName('');
      setUploadFile(null);
      fetchDocs();
    } catch (err) {
      await alert({ title: 'Upload failed', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/class-documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingId(null);
      fetchDocs();
    } catch (err) {
      await alert({ title: 'Rename failed', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const idx = docs.findIndex(d => d.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= docs.length) return;

    await Promise.all([
      fetch(`/api/admin/class-documents/${docs[idx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: docs[swapIdx].sort_order }),
      }),
      fetch(`/api/admin/class-documents/${docs[swapIdx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: docs[idx].sort_order }),
      }),
    ]);
    fetchDocs();
  };

  const handleDelete = async (doc: ClassDoc) => {
    const ok = await confirm({
      title: `Delete "${doc.name}"?`,
      message: 'This permanently removes the document. Investors will no longer see it.',
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/class-documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchDocs();
    } catch (err) {
      await alert({ title: 'Delete failed', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
            <h1 className="text-xl font-bold text-gray-900">Share Class Documents</h1>
          </div>
          <button
            onClick={() => { setShowUpload(!showUpload); setUploadName(''); setUploadFile(null); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            + Upload Document
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Class selector tabs */}
        <div className="flex gap-2">
          {SHARE_CLASSES.map(cls => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedClass === cls
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500">
          Documents below will be shown to investors subscribing to <strong>{selectedClass}</strong> on their form page for download.
        </p>

        {/* Upload form */}
        {showUpload && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Upload Document for {selectedClass}</h2>
            <form onSubmit={handleUpload} className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-gray-600 mb-1">Display Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="e.g. Term Sheet"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-gray-600 mb-1">File</label>
                <input
                  type="file"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  required
                  className="w-full text-sm text-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>
        )}

        {/* Documents list */}
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No documents uploaded for {selectedClass} yet.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {docs.map((doc, idx) => (
              <div key={doc.id} className="px-4 py-3 flex items-center gap-3">
                {/* Reorder arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMove(doc.id, 'up')}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMove(doc.id, 'down')}
                    disabled={idx === docs.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                  >
                    ▼
                  </button>
                </div>

                {/* Name / edit */}
                <div className="flex-1 min-w-0">
                  {editingId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm text-gray-900"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(doc.id); if (e.key === 'Escape') setEditingId(null); }}
                      />
                      <button onClick={() => handleRename(doc.id)} disabled={saving} className="text-xs text-blue-600 hover:text-blue-800">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500">{doc.original_name} · {formatSize(doc.file_size)}</p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setEditingId(doc.id); setEditName(doc.name); }}
                    className="text-xs text-gray-600 hover:text-blue-600"
                  >
                    Rename
                  </button>
                  {doc.mime_type === 'application/pdf' && (
                    <button
                      onClick={() => setPreviewFile({ id: doc.id, name: doc.name, mimeType: doc.mime_type })}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Preview
                    </button>
                  )}
                  <a
                    href={`/api/admin/class-documents/${doc.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800"
                    download
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium text-gray-900 text-sm truncate">{previewFile.name}</span>
              <div className="flex items-center gap-2">
                <a href={`/api/admin/class-documents/${previewFile.id}`} download className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1 rounded">Download</a>
                <button onClick={() => setPreviewFile(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
            </div>
            <iframe src={`/api/admin/class-documents/${previewFile.id}?inline=1`} className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
