'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDialog } from '@/components/Dialog';

interface Investor {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  investor_type: string;
  share_class: string | null;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  drive_folder_url: string | null;
  source: string;
}

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const { alert } = useDialog();

  const fetchInvestors = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/investors');
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
      const data = await res.json();
      setInvestors(data.investors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvestors(); }, [fetchInvestors]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_drive' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncResult(`Synced ${data.synced} folders from Drive`);
      fetchInvestors();
    } catch (err) {
      await alert({ title: 'Sync failed', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/investors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: editFirst, lastName: editLast, email: editEmail || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingId(null);
      fetchInvestors();
    } catch (err) {
      await alert({ title: 'Save failed', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = search
    ? investors.filter(inv =>
        `${inv.first_name} ${inv.last_name} ${inv.email || ''} ${inv.drive_folder_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    : investors;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
            <h1 className="text-xl font-bold text-gray-900">Existing Investors</h1>
            <span className="text-sm text-gray-500">{investors.length} total</span>
          </div>
          <div className="flex items-center gap-3">
            {syncResult && <span className="text-sm text-green-600">{syncResult}</span>}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Syncing...</>
              ) : 'Sync from Google Drive'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search investors..."
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
          />
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Class</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Drive Folder</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Source</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {editingId === inv.id ? (
                        <div className="flex gap-1">
                          <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="w-24 px-1 py-0.5 border rounded text-xs" placeholder="First" />
                          <input value={editLast} onChange={e => setEditLast(e.target.value)} className="w-24 px-1 py-0.5 border rounded text-xs" placeholder="Last" />
                        </div>
                      ) : (
                        <div>
                          <span className="font-medium text-gray-900">{inv.last_name.toUpperCase()} {inv.first_name}</span>
                          {inv.drive_folder_name && inv.drive_folder_name !== `${inv.last_name.toUpperCase()} ${inv.first_name}` && (
                            <p className="text-xs text-gray-400">Drive: {inv.drive_folder_name}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === inv.id ? (
                        <input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-40 px-1 py-0.5 border rounded text-xs" placeholder="email" />
                      ) : (
                        <span className="text-gray-600 text-xs">{inv.email || <span className="text-gray-300">—</span>}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{inv.share_class || '—'}</td>
                    <td className="px-4 py-3">
                      {inv.drive_folder_url ? (
                        <a href={inv.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline" onClick={e => e.stopPropagation()}>
                          Open in Drive
                        </a>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${inv.source === 'portal' ? 'bg-blue-100 text-blue-700' : inv.source === 'drive' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {inv.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === inv.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleSave(inv.id)} disabled={saving} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs border text-gray-600 rounded hover:bg-gray-50">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingId(inv.id); setEditFirst(inv.first_name); setEditLast(inv.last_name); setEditEmail(inv.email || ''); }} className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {investors.length === 0 ? 'No investors yet. Click "Sync from Google Drive" to import.' : 'No matches.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
