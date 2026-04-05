'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function EmailTemplatesPage() {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/email-templates')
      .then(r => {
        if (r.status === 401) { window.location.href = '/admin/login'; return null; }
        return r.json();
      })
      .then(data => {
        if (data?.template) {
          setSubject(data.template.subject);
          setBodyHtml(data.template.body_html);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/email-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Email Template</h1>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Available placeholders: <code className="bg-white px-1 rounded">{'{{investorName}}'}</code>, <code className="bg-white px-1 rounded">{'{{link}}'}</code>, <code className="bg-white px-1 rounded">{'{{expiresAt}}'}</code>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={20}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm text-gray-900"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-2">Subject: <strong className="text-gray-900">{subject.replace(/\{\{investorName\}\}/g, 'John Doe').replace(/\{\{expiresAt\}\}/g, 'May 1, 2026')}</strong></p>
            <hr className="my-2" />
            <div
              dangerouslySetInnerHTML={{
                __html: bodyHtml
                  .replace(/\{\{investorName\}\}/g, 'John Doe')
                  .replace(/\{\{link\}\}/g, 'https://example.com/submit/abc123')
                  .replace(/\{\{expiresAt\}\}/g, 'May 1, 2026')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
