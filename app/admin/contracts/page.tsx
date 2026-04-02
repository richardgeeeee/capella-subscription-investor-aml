'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Template {
  id: string;
  name: string;
  investor_type: string;
  file_type: string;
  original_name: string;
  created_at: string;
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading...</div>}>
      <ContractsContent />
    </Suspense>
  );
}

function ContractsContent() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('submissionId');
  const investorType = searchParams.get('investorType');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState<string>(investorType || 'individual');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mappings, setMappings] = useState<Array<{ placeholder: string; formField: string }>>([{ placeholder: '', formField: '' }]);
  const [uploading, setUploading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contracts/templates');
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      setTemplates(data.templates);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('name', uploadName);
      formData.append('investorType', uploadType);
      formData.append('file', uploadFile);
      formData.append('mappings', JSON.stringify(mappings.filter(m => m.placeholder && m.formField)));

      const res = await fetch('/api/admin/contracts/templates', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowUpload(false);
      setUploadName('');
      setUploadFile(null);
      setMappings([{ placeholder: '', formField: '' }]);
      fetchTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async (templateId: string) => {
    if (!submissionId) return;
    setGenerating(templateId);

    try {
      const res = await fetch('/api/admin/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, submissionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="(.+?)"/);
      const fileName = match ? decodeURIComponent(match[1]) : 'contract';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  };

  const addMapping = () => setMappings([...mappings, { placeholder: '', formField: '' }]);
  const removeMapping = (index: number) => setMappings(mappings.filter((_, i) => i !== index));
  const updateMapping = (index: number, field: 'placeholder' | 'formField', value: string) => {
    const updated = [...mappings];
    updated[index][field] = value;
    setMappings(updated);
  };

  const filteredTemplates = investorType
    ? templates.filter(t => t.investor_type === investorType)
    : templates;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
            <h1 className="text-xl font-bold text-gray-900">Contract Templates</h1>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            + Upload Template
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {submissionId && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Select a template to generate a pre-filled contract for submission: {submissionId.slice(0, 8)}...
          </div>
        )}

        {/* Upload form */}
        {showUpload && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Upload Contract Template</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                    placeholder="e.g. Individual Subscription Agreement"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Investor Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="individual">Individual</option>
                    <option value="corporate">Corporate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Template File (.docx or .pdf)</label>
                  <input
                    type="file"
                    accept=".docx,.pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    required
                    className="w-full text-sm text-gray-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Field Mappings (template placeholder &rarr; form field)
                  </label>
                  <button type="button" onClick={addMapping} className="text-sm text-blue-600 hover:text-blue-800">
                    + Add Mapping
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  For DOCX: use {'{{placeholder}}'} syntax in the template. For PDF: use the form field name.
                </p>
                {mappings.map((mapping, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={mapping.placeholder}
                      onChange={(e) => updateMapping(index, 'placeholder', e.target.value)}
                      placeholder="Template placeholder (e.g. investor_name)"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                    />
                    <span className="text-gray-400 self-center">&rarr;</span>
                    <input
                      type="text"
                      value={mapping.formField}
                      onChange={(e) => updateMapping(index, 'formField', e.target.value)}
                      placeholder="Form field key (e.g. investorName)"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                    />
                    {mappings.length > 1 && (
                      <button type="button" onClick={() => removeMapping(index)} className="text-red-400 hover:text-red-600 text-sm">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Template'}
              </button>
            </form>
          </div>
        )}

        {/* Templates list */}
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Format</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">File</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
                  {submissionId && <th className="text-left px-4 py-3 text-gray-600 font-medium">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTemplates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tpl.name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{tpl.investor_type}</td>
                    <td className="px-4 py-3 text-gray-600 uppercase">{tpl.file_type}</td>
                    <td className="px-4 py-3 text-gray-500">{tpl.original_name}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(tpl.created_at).toLocaleDateString()}</td>
                    {submissionId && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleGenerate(tpl.id)}
                          disabled={generating === tpl.id}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {generating === tpl.id ? 'Generating...' : 'Generate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredTemplates.length === 0 && (
                  <tr>
                    <td colSpan={submissionId ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                      No templates found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
