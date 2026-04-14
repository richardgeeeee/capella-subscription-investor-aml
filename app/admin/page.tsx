'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { SHARE_CLASSES, type ShareClass } from '@/lib/constants';

interface LinkData {
  id: string;
  token: string;
  investor_name: string;
  first_name: string | null;
  last_name: string | null;
  share_class: string | null;
  sequence_number: number | null;
  investor_type: string;
  investor_email: string | null;
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
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newShareClass, setNewShareClass] = useState<ShareClass>('Class E');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState<'individual' | 'corporate'>('individual');
  const [newDays, setNewDays] = useState('30');
  const [newSequence, setNewSequence] = useState('');
  const [suggestedSequence, setSuggestedSequence] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdLinkId, setCreatedLinkId] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [sentLinkIds, setSentLinkIds] = useState<Set<string>>(new Set());

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
    fetch('/api/admin/next-sequence').then(r => r.ok ? r.json() : null).then(data => {
      if (typeof data?.next === 'number') setSuggestedSequence(data.next);
    });
  }, [fetchLinks]);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCopied(false);
    setEmailSent(false);
    try {
      const res = await fetch('/api/admin/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newFirstName,
          lastName: newLastName,
          shareClass: newShareClass,
          sequenceNumber: newSequence ? parseInt(newSequence) : undefined,
          investorType: newType,
          investorEmail: newEmail || undefined,
          expiresInDays: parseInt(newDays),
        }),
      });
      const text = await res.text();
      if (!text) throw new Error('Server returned empty response — check deploy logs');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setCreatedUrl(data.url);
      setCreatedLinkId(data.id);
      setCreatedEmail(newEmail);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewSequence('');
      fetchLinks();
      // Refresh suggested sequence
      fetch('/api/admin/next-sequence').then(r => r.ok ? r.json() : null).then(d => {
        if (typeof d?.next === 'number') setSuggestedSequence(d.next);
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch('/api/admin/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId: createdLinkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setEmailSent(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendForLink = async (linkId: string) => {
    setSendingLinkId(linkId);
    try {
      const res = await fetch('/api/admin/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setSentLinkIds(prev => new Set(prev).add(linkId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingLinkId(null);
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
            <Link href="/admin/email-templates" className="text-sm text-blue-600 hover:text-blue-800">
              Email Template
            </Link>
            <Link href="/admin/contracts" className="text-sm text-blue-600 hover:text-blue-800">
              Contract Templates
            </Link>
            <button
              onClick={() => { setShowForm(!showForm); setCreatedUrl(''); setCopied(false); setEmailSent(false); }}
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
                <label className="block text-sm text-gray-600 mb-1">First Name</label>
                <input
                  type="text"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="e.g. Jin"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Last Name</label>
                <input
                  type="text"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="e.g. Zhang"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="investor@email.com"
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
                <label className="block text-sm text-gray-600 mb-1">Share Class</label>
                <select
                  value={newShareClass}
                  onChange={(e) => setNewShareClass(e.target.value as ShareClass)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  {SHARE_CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Sequence #
                  {suggestedSequence != null && <span className="text-gray-400 ml-1">(auto: {suggestedSequence})</span>}
                </label>
                <input
                  type="number"
                  value={newSequence}
                  onChange={(e) => setNewSequence(e.target.value)}
                  min="1"
                  className="px-3 py-2 border border-gray-300 rounded-lg w-28 text-gray-900"
                  placeholder={suggestedSequence != null ? String(suggestedSequence) : 'auto'}
                />
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
                    onClick={() => handleCopy(createdUrl)}
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
                {/* Send email section */}
                {createdEmail && (
                  <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-3">
                    <button
                      onClick={handleSendEmail}
                      disabled={sendingEmail || emailSent}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        emailSent
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                      }`}
                    >
                      {emailSent ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Email Sent
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          {sendingEmail ? 'Sending...' : `Send to ${createdEmail}`}
                        </>
                      )}
                    </button>
                    <Link href="/admin/email-templates" className="text-sm text-gray-500 hover:text-blue-600">
                      Edit template
                    </Link>
                  </div>
                )}
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
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">#</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Investor</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Class</th>
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
                    <td className="px-4 py-3 text-gray-500 text-xs">{link.sequence_number ? String(link.sequence_number).padStart(3, '0') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{link.investor_name}</div>
                      {link.investor_email && <div className="text-xs text-gray-400">{link.investor_email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{link.investor_type}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{link.share_class || '-'}</td>
                    <td className="px-4 py-3">{getStatusBadge(link)}</td>
                    <td className="px-4 py-3 text-gray-600">{link.latest_sync_status || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(link.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(link.expires_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/links/${link.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View
                        </Link>
                        {link.investor_email && (
                          <button
                            onClick={() => handleSendForLink(link.id)}
                            disabled={sendingLinkId === link.id || sentLinkIds.has(link.id)}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                              sentLinkIds.has(link.id)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-700'
                            }`}
                            title={`Send invitation to ${link.investor_email}`}
                          >
                            {sentLinkIds.has(link.id) ? (
                              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Sent</>
                            ) : sendingLinkId === link.id ? (
                              'Sending...'
                            ) : (
                              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Send</>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {links.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
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
