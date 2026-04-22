'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { SHARE_CLASSES, type ShareClass } from '@/lib/constants';
import { useDialog } from '@/components/Dialog';

interface LinkData {
  id: string;
  token: string;
  investor_name: string;
  first_name: string | null;
  last_name: string | null;
  share_class: string | null;
  investor_type: string;
  investor_email: string | null;
  expires_at: string;
  created_at: string;
  is_revoked: number;
  submission_count: number;
  latest_status: string | null;
  latest_sync_status: string | null;
  target_subscription_date: string | null;
  subscription_amount: string | null;
  link_category: string;
  recent_event_count: number;
}

interface ExistingInvestor {
  id: string;
  first_name: string;
  last_name: string;
  investor_name?: string;
  investor_type: string;
  email: string | null;
  investor_email?: string | null;
  share_class: string | null;
  drive_folder_id: string | null;
}

interface AdminUser {
  email: string;
  name: string;
  picture?: string;
}

function parseAmount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function AdminDashboard() {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [existingInvestors, setExistingInvestors] = useState<ExistingInvestor[]>([]);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [linkCategory, setLinkCategory] = useState<'new_subscription' | 'topup'>('new_subscription');
  const [selectedInvestor, setSelectedInvestor] = useState<ExistingInvestor | null>(null);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newShareClass, setNewShareClass] = useState<ShareClass>('Class E');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState<'individual' | 'corporate'>('individual');
  const [newDays, setNewDays] = useState('30');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdLinkId, setCreatedLinkId] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [sentLinkIds, setSentLinkIds] = useState<Set<string>>(new Set());
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<'all' | 'new_subscription' | 'topup'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState('');
  const [sortField, setSortField] = useState<'created_at' | 'target_subscription_date' | 'subscription_amount'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { confirm, alert } = useDialog();

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/links');
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
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
    fetch('/api/admin/investors').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.investors) setExistingInvestors(data.investors);
    });
  }, [fetchLinks]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectInvestor = (inv: ExistingInvestor) => {
    setSelectedInvestor(inv);
    setNewFirstName(inv.first_name);
    setNewLastName(inv.last_name);
    setNewEmail(inv.email || inv.investor_email || '');
    setNewType((inv.investor_type || 'individual') as 'individual' | 'corporate');
    if (inv.share_class) setNewShareClass(inv.share_class as ShareClass);
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
          investorType: newType,
          investorEmail: newEmail || undefined,
          expiresInDays: parseInt(newDays),
          linkCategory,
          driveFolderId: linkCategory === 'topup' && selectedInvestor?.drive_folder_id ? selectedInvestor.drive_folder_id : undefined,
        }),
      });
      const text = await res.text();
      if (!text) throw new Error('Server returned empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setCreatedUrl(data.url);
      setCreatedLinkId(data.id);
      setCreatedEmail(newEmail);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setSelectedInvestor(null);
      fetchLinks();
      fetch('/api/admin/investors').then(r => r.ok ? r.json() : null).then(d => {
        if (d?.investors) setExistingInvestors(d.investors);
      });
    } catch (err) {
      await alert({ title: 'Failed to create link', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
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
      await alert({ title: 'Failed to send email', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDelete = async (link: LinkData) => {
    const ok = await confirm({
      title: `Delete ${link.investor_name}?`,
      message: 'This permanently removes the link, all submissions, uploaded files, and generated drafts.\n\nThis cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setDeletingLinkId(link.id);
    try {
      const res = await fetch(`/api/admin/links/${link.id}`, { method: 'DELETE' });
      const data = res.status !== 204 ? await res.json().catch(() => ({})) : {};
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      fetchLinks();
    } catch (err) {
      await alert({ title: 'Failed to delete', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setDeletingLinkId(null);
    }
  };

  const handleSendForLink = async (linkId: string, email: string) => {
    const ok = await confirm({
      title: 'Send invitation email?',
      message: `Send invitation email to ${email}?`,
      variant: 'warning',
      confirmLabel: 'Send',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
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
      await alert({ title: 'Failed to send email', message: err instanceof Error ? err.message : 'Failed', variant: 'error' });
    } finally {
      setSendingLinkId(null);
    }
  };

  const getStatusKey = (link: LinkData) => {
    const now = new Date();
    const expires = new Date(link.expires_at);
    if (link.is_revoked) return 'revoked';
    if (now > expires) return 'expired';
    if (link.latest_status === 'finalized') return 'finalized';
    if (link.latest_status === 'draft') return 'draft';
    return 'pending';
  };

  const getStatusBadge = (link: LinkData) => {
    const s = getStatusKey(link);
    const map: Record<string, string> = {
      revoked: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-700',
      finalized: 'bg-green-100 text-green-700',
      draft: 'bg-yellow-100 text-yellow-700',
      pending: 'bg-blue-100 text-blue-700',
    };
    return <span className={`px-2 py-0.5 text-xs rounded capitalize ${map[s]}`}>{s}</span>;
  };

  // Filtered + sorted links
  const filteredLinks = useMemo(() => {
    let result = [...links];
    if (filterCategory !== 'all') result = result.filter(l => (l.link_category || 'new_subscription') === filterCategory);
    if (filterStatus !== 'all') result = result.filter(l => getStatusKey(l) === filterStatus);
    if (filterDate) result = result.filter(l => l.target_subscription_date?.startsWith(filterDate));
    result.sort((a, b) => {
      let va: string | number = '', vb: string | number = '';
      if (sortField === 'created_at') { va = a.created_at; vb = b.created_at; }
      else if (sortField === 'target_subscription_date') { va = a.target_subscription_date || ''; vb = b.target_subscription_date || ''; }
      else if (sortField === 'subscription_amount') { va = parseAmount(a.subscription_amount); vb = parseAmount(b.subscription_amount); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [links, filterCategory, filterStatus, filterDate, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIcon = (field: typeof sortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const byMonth: Record<string, { newCount: number; newAmount: number; topupCount: number; topupAmount: number }> = {};
    for (const link of links) {
      if (!link.target_subscription_date || !link.subscription_amount) continue;
      const month = link.target_subscription_date.slice(0, 7);
      const amount = parseAmount(link.subscription_amount);
      if (!amount) continue;
      if (!byMonth[month]) byMonth[month] = { newCount: 0, newAmount: 0, topupCount: 0, topupAmount: 0 };
      const cat = link.link_category || 'new_subscription';
      if (cat === 'topup') { byMonth[month].topupCount++; byMonth[month].topupAmount += amount; }
      else { byMonth[month].newCount++; byMonth[month].newAmount += amount; }
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  }, [links]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Capella KYC Admin</h1>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {user.picture && <img src={user.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />}
                <span>{user.name}</span>
              </div>
            )}
            <Link href="/admin/email-templates" className="text-sm text-blue-600 hover:text-blue-800">Email Template</Link>
            <Link href="/admin/contracts" className="text-sm text-blue-600 hover:text-blue-800">Contract Templates</Link>
            <Link href="/admin/class-documents" className="text-sm text-blue-600 hover:text-blue-800">Class Documents</Link>
            <Link href="/admin/investors" className="text-sm text-blue-600 hover:text-blue-800">Investors</Link>
            <button
              onClick={() => { setShowForm(!showForm); setCreatedUrl(''); setCopied(false); setEmailSent(false); setLinkCategory('new_subscription'); setSelectedInvestor(null); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              + New Link
            </button>
            <button
              onClick={async () => {
                await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
                window.location.href = '/admin/login';
              }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Create link form */}
        {showForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            {/* Category toggle */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { setLinkCategory('new_subscription'); setSelectedInvestor(null); setNewFirstName(''); setNewLastName(''); setNewEmail(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${linkCategory === 'new_subscription' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                New Subscription
              </button>
              <button
                onClick={() => { setLinkCategory('topup'); setSelectedInvestor(null); setNewFirstName(''); setNewLastName(''); setNewEmail(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${linkCategory === 'topup' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Top-up
              </button>
            </div>

            <h2 className="text-lg font-semibold mb-4">
              {linkCategory === 'topup' ? 'Generate Top-up Link' : 'Generate New Subscription Link'}
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Top-up: investor selector */}
              {linkCategory === 'topup' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Select Existing Investor</label>
                  <select
                    value={selectedInvestor ? (selectedInvestor.id || `${selectedInvestor.first_name}|${selectedInvestor.last_name}`) : ''}
                    onChange={e => {
                      if (!e.target.value) { setSelectedInvestor(null); setNewFirstName(''); setNewLastName(''); setNewEmail(''); return; }
                      const inv = existingInvestors.find(i => (i.id || `${i.first_name}|${i.last_name}`) === e.target.value);
                      if (inv) handleSelectInvestor(inv);
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="">— Select an investor —</option>
                    {existingInvestors.map((inv) => (
                      <option key={inv.id || `${inv.first_name}|${inv.last_name}`} value={inv.id || `${inv.first_name}|${inv.last_name}`}>
                        {inv.last_name?.toUpperCase()} {inv.first_name} {inv.email || inv.investor_email ? `(${inv.email || inv.investor_email})` : ''} {inv.share_class ? `[${inv.share_class}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap gap-4 items-end">
                {linkCategory === 'new_subscription' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">First Name</label>
                      <input type="text" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} required className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900" placeholder="e.g. Jin" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Last Name</label>
                      <input type="text" value={newLastName} onChange={e => setNewLastName(e.target.value)} required className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900" placeholder="e.g. Zhang" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900" placeholder="investor@email.com" />
                </div>
                {linkCategory === 'new_subscription' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Type</label>
                    <select value={newType} onChange={e => setNewType(e.target.value as 'individual' | 'corporate')} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
                      <option value="individual">Individual</option>
                      <option value="corporate">Corporate</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Share Class</label>
                  <select value={newShareClass} onChange={e => setNewShareClass(e.target.value as ShareClass)} required className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
                    {SHARE_CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Expiry (days)</label>
                  <input type="number" value={newDays} onChange={e => setNewDays(e.target.value)} min="1" className="px-3 py-2 border border-gray-300 rounded-lg w-24 text-gray-900" />
                </div>
                <button type="submit" disabled={creating} className={`px-6 py-2 rounded-lg text-white disabled:opacity-50 ${linkCategory === 'topup' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {creating ? 'Creating...' : 'Generate'}
                </button>
              </div>
            </form>

            {createdUrl && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700 mb-1">Link created! Share with the investor:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-white px-2 py-1 rounded border flex-1 break-all text-gray-900">{createdUrl}</code>
                  <button onClick={() => handleCopy(createdUrl)} className={`p-2 rounded-lg border transition-colors ${copied ? 'bg-green-100 border-green-300 text-green-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`} title={copied ? 'Copied!' : 'Copy'}>
                    {copied ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                  </button>
                </div>
                {createdEmail && (
                  <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-3">
                    <button onClick={handleSendEmail} disabled={sendingEmail || emailSent} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${emailSent ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'}`}>
                      {emailSent ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Email Sent</>
                      : <>{sendingEmail ? 'Sending...' : `Send to ${createdEmail}`}</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Monthly summary table */}
        {!loading && monthlySummary.length > 0 && (
          <div className="mb-4 bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Month</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">New (#)</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">New (USD)</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Top-up (#)</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Top-up (USD)</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Total (#)</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Total (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthlySummary.map(([month, d]) => (
                  <tr key={month} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{month}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{d.newCount || '-'}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{d.newAmount ? `$${d.newAmount.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-2 text-right text-purple-600">{d.topupCount || '-'}</td>
                    <td className="px-4 py-2 text-right text-purple-600">{d.topupAmount ? `$${d.topupAmount.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{d.newCount + d.topupCount}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">${(d.newAmount + d.topupAmount).toLocaleString()}</td>
                  </tr>
                ))}
                {monthlySummary.length > 1 && (() => {
                  const totals = monthlySummary.reduce((acc, [, d]) => ({
                    nc: acc.nc + d.newCount, na: acc.na + d.newAmount,
                    tc: acc.tc + d.topupCount, ta: acc.ta + d.topupAmount,
                  }), { nc: 0, na: 0, tc: 0, ta: 0 });
                  return (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-gray-900">Total</td>
                      <td className="px-4 py-2 text-right text-gray-600">{totals.nc}</td>
                      <td className="px-4 py-2 text-right text-gray-600">${totals.na.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-purple-600">{totals.tc}</td>
                      <td className="px-4 py-2 text-right text-purple-600">${totals.ta.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{totals.nc + totals.tc}</td>
                      <td className="px-4 py-2 text-right text-gray-900">${(totals.na + totals.ta).toLocaleString()}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* Filters */}
        {!loading && links.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as typeof filterCategory)} className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700">
              <option value="all">All Categories</option>
              <option value="new_subscription">New Subscription</option>
              <option value="topup">Top-up</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="expired">Expired</option>
            </select>
            <input type="month" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700" placeholder="Filter by date" />
            {filterDate && <button onClick={() => setFilterDate('')} className="text-xs text-gray-500 hover:text-red-500">Clear date</button>}
            <span className="text-xs text-gray-400 ml-2">{filteredLinks.length} of {links.length} shown</span>
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
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Category</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Class</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('target_subscription_date')}>Target Date{sortIcon('target_subscription_date')}</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('subscription_amount')}>Amount{sortIcon('subscription_amount')}</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('created_at')}>Created{sortIcon('created_at')}</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLinks.map((link) => {
                  const cat = link.link_category || 'new_subscription';
                  const hasEvents = (link.recent_event_count || 0) > 0;
                  return (
                    <tr
                      key={link.id}
                      className={`hover:bg-gray-50 cursor-pointer ${hasEvents ? 'bg-yellow-50' : ''}`}
                      onClick={() => window.location.href = `/admin/links/${link.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-gray-900">{link.investor_name}</div>
                            {link.investor_email && <div className="text-xs text-gray-400">{link.investor_email}</div>}
                          </div>
                          {hasEvents && (
                            <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-500 text-white rounded-full">{link.recent_event_count}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded ${cat === 'topup' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {cat === 'topup' ? 'Top-up' : 'New'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{link.share_class || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{link.target_subscription_date || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs whitespace-nowrap">{link.subscription_amount ? `$${parseAmount(link.subscription_amount).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3">{getStatusBadge(link)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(link.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {link.investor_email && (
                            <button
                              onClick={() => handleSendForLink(link.id, link.investor_email!)}
                              disabled={sendingLinkId === link.id || sentLinkIds.has(link.id)}
                              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${sentLinkIds.has(link.id) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-700'}`}
                            >
                              {sentLinkIds.has(link.id) ? 'Sent' : sendingLinkId === link.id ? '...' : 'Send'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(link)}
                            disabled={deletingLinkId === link.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
                          >
                            {deletingLinkId === link.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLinks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {links.length === 0 ? 'No investor links yet.' : 'No matches for current filters.'}
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
