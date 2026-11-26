'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface LinkData {
  id: string;
  investor_name: string;
  first_name: string | null;
  last_name: string | null;
  legal_first_name: string | null;
  legal_last_name: string | null;
  share_class: string | null;
  target_subscription_date: string | null;
  subscription_amount: string | null;
  investor_type: string;
}

interface FormData {
  identificationNumber?: string;
  residentialAddress?: string;
  legalFirstName?: string;
  legalLastName?: string;
}

interface StaffOption {
  name: string;
  ceNumber: string;
}

export default function GenerateAgreementPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const [link, setLink] = useState<LinkData | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [templateAvailable, setTemplateAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [legalFullName, setLegalFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(0);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; fileName?: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [submRes, agreeRes] = await Promise.all([
          fetch(`/api/admin/submissions?linkId=${linkId}`),
          fetch('/api/admin/generate-agreement'),
        ]);
        if (submRes.status === 401) { window.location.href = '/admin/login'; return; }

        const submData = await submRes.json();
        setLink(submData.link);

        const fd = submData.submissions?.[0]?.form_data || {};
        setFormData(fd);

        // Pre-populate fields
        const l = submData.link as LinkData;
        const legalLast = l.legal_last_name || fd.legalLastName || l.last_name || '';
        const legalFirst = l.legal_first_name || fd.legalFirstName || l.first_name || '';
        setLegalFullName(legalLast && legalFirst ? `${legalLast.toUpperCase()} ${legalFirst}` : '');
        setIdNumber(fd.identificationNumber || '');
        setRegisteredAddress(fd.residentialAddress || '');

        // Default agreement date = subscription date - 2 days
        if (l.target_subscription_date) {
          const d = new Date(l.target_subscription_date + 'T00:00:00');
          d.setDate(d.getDate() - 2);
          setAgreementDate(d.toISOString().slice(0, 10));
        }

        if (agreeRes.ok) {
          const agreeData = await agreeRes.json();
          setTemplateAvailable(agreeData.templateAvailable);
          setStaffOptions(agreeData.authorisedStaff || []);
        }
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [linkId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);
    try {
      const staff = staffOptions[selectedStaff];
      const res = await fetch('/api/admin/generate-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId,
          legalFullName,
          idNumber,
          registeredAddress,
          agreementDate,
          staffName: staff?.name || '',
          staffCeNumber: staff?.ceNumber || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ success: true, message: `Generated: ${data.fileName}`, fileName: data.fileName });
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!link) return <div className="p-8 text-red-500">Link not found</div>;

  const missingFields: string[] = [];
  if (!legalFullName) missingFields.push('Legal Full Name');
  if (!idNumber) missingFields.push('Identification Number');
  if (!registeredAddress) missingFields.push('Registered Address');
  if (!agreementDate) missingFields.push('Agreement Date');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/admin/links/${linkId}`} className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
          <h1 className="text-xl font-bold text-gray-900">Generate Individual Client Agreement</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Investor context */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Investor</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Preferred Name</p>
              <p className="font-medium">{link.investor_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Share Class</p>
              <p className="font-medium">{link.share_class || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Subscription Date</p>
              <p className="font-medium">{link.target_subscription_date || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Amount (USD)</p>
              <p className="font-medium">{link.subscription_amount ? `$${Number(link.subscription_amount).toLocaleString()}` : '-'}</p>
            </div>
          </div>
        </div>

        {!templateAvailable && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium">AcroForm template not found</p>
            <p className="text-xs text-amber-700 mt-1">
              Place the prepared AcroForm PDF as <code className="bg-amber-100 px-1 rounded">assets/individual_client_agreement_v3_form.pdf</code> and redeploy.
              Create it in Adobe Acrobat via Prepare Form with the field names from the guidance document.
            </p>
          </div>
        )}

        {/* Review fields */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Contract Fields — Review & Confirm</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Legal Full Name (as on contract)</label>
              <input type="text" value={legalFullName} onChange={e => setLegalFullName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. CHEN Yiting" />
              <p className="text-xs text-gray-500 mt-1">Format: LASTNAME Firstname — must match passport/ID</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Identification Number</label>
              <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. M066108(8)" />
              <p className="text-xs text-gray-500 mt-1">HKID, passport number, or national ID</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agreement Date</label>
              <input type="date" value={agreementDate} onChange={e => setAgreementDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-500 mt-1">Default: Subscription Date − 2 days. Override if needed.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Registered Address</label>
              <input type="text" value={registeredAddress} onChange={e => setRegisteredAddress(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full residential address" />
              <p className="text-xs text-gray-500 mt-1">Verify this matches the address proof — override if the form value is stale.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Licensed Staff</label>
              <select value={selectedStaff} onChange={e => setSelectedStaff(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {staffOptions.map((s, i) => (
                  <option key={i} value={i}>{s.name} (CE: {s.ceNumber})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Validation + generate */}
        <div className="bg-white rounded-lg shadow p-6">
          {missingFields.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">Missing fields: {missingFields.join(', ')}</p>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || missingFields.length > 0 || !templateAvailable}
            className="w-full py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate Individual Client Agreement'}
          </button>

          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
