'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface LinkData {
  id: string;
  token: string;
  investor_name: string;
  investor_type: string;
  expires_at: string;
  created_at: string;
  is_revoked: number;
  submission_count: number;
  latest_status: string | null;
  latest_sync_status: string | null;
}

interface AdminUser {
  email: string;
  name: string;
  picture?: string;
}

export default function AdminDashboard() {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'individual' | 'corporate'>('individual');
  const [newDays, setNewDays] = useState('30');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/links');
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      setLinks(data.links);
    } catch (err) {
      console.error('Failed to fetch links:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
    fetch('/api/admin/session').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.authenticated) setUser(data);
    });
  }, [fetchLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investorName: newName, investorType: newType, expiresInDays: parseInt(newDays) }),
      });
      const text = await res.text();
      if (!text) throw new Error('Server returned empty response — check Railway deploy logs');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setCreatedUrl(data.url);
      setNewName('');
      fetchLinks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (link: LinkData) => {
    const now = new Date();
    const expires = new Date(link.expires_at);

    if (link.is_revoked) return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">Revoked</span>;
    if (now > expires) return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">Expired</span>;
    if (link.latest_status === 'finalized') return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Finalized</span>;
    if (link.latest_status === 'draft') return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">Draft</span>;
    return <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Pending</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Capella KYC Admin</h1>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {user.picture && (
                  <img src={user.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                )}
                <span>{user.name}</span>
              </div>
            )}
            <Link href="/admin/contracts" className="text-sm text-blue-600 hover:text-blue-800">
              Contract Templates
            </Link>
            <button
              onClick={() => { setShowForm(!showForm); setCreatedUrl(''); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              + New Link
            </button>
            <button
              onClick={async () => {
                await fetch('/api/admin/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'logout' }),
                });
                window.location.href = '/admin/login';
              }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Create link form */}
        {showForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Generate Investor Link</h2>
            <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Investor Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="e.g. Gordon Ding"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as 'individual' | 'corporate')}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="individual">Individual</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Expiry (days)</label>
                <input
                  type="number"
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  min="1"
                  className="px-3 py-2 border border-gray-300 rounded-lg w-24 text-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Generate'}
              </button>
            </form>
            {createdUrl && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700 mb-1">Link created! Share with the investor:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-white px-2 py-1 rounded border flex-1 break-all text-gray-900">{createdUrl}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(createdUrl)}
                    className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Links table */}
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Investor</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Sync</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Expires</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{link.investor_name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{link.investor_type}</td>
                    <td className="px-4 py-3">{getStatusBadge(link)}</td>
                    <td className="px-4 py-3 text-gray-600">{link.latest_sync_status || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(link.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(link.expires_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/links/${link.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {links.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No investor links yet. Click &quot;+ New Link&quot; to create one.
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
