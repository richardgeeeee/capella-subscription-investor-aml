'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type Language, t } from '@/lib/i18n';
import { type InvestorType, type UploadedFileInfo } from '@/lib/types';
import { INDIVIDUAL_DOCUMENT_TYPES, CORPORATE_DOCUMENT_TYPES } from '@/lib/constants';
import { LanguageToggle } from './LanguageToggle';
import { FormField } from './FormField';
import { MonthEndDateField } from './MonthEndDateField';
import { FileDropzone } from './FileDropzone';
import { EmploymentHistorySection } from './EmploymentHistorySection';

interface InvestorFormProps {
  token: string;
  investorName: string;
  investorType: InvestorType;
  shareClass: string | null;
  expiresAt: string;
  savedFormData: Record<string, string>;
  uploadedFiles: UploadedFileInfo[];
  submittedVersionCount: number;
  lastSubmittedAt: string | null;
}

interface FieldDef {
  key: string;
  type?: 'text' | 'date' | 'email' | 'number' | 'textarea' | 'month_end' | 'employment_history';
  readOnly?: boolean;
  required?: boolean;
  footnoteKey?: string;
}

interface SectionDef {
  section: string;
  fields: FieldDef[];
}

const INDIVIDUAL_FIELDS: SectionDef[] = [
  { section: 'section_subscription', fields: [
    { key: 'investorName', readOnly: true, required: true },
    { key: 'shareClass', readOnly: true, required: true },
    { key: 'subscriptionDate', type: 'month_end', required: true, footnoteKey: 'footnote_subscription_date' },
    { key: 'subscriptionAmount', required: true, footnoteKey: 'footnote_subscription_amount' },
  ]},
  { section: 'section_investor', fields: [
    { key: 'dateOfBirth', type: 'date', required: true },
    { key: 'cityCountryOfBirth', required: true },
    { key: 'nationality', required: true },
    { key: 'countryOfResidence', required: true },
    { key: 'countryOfTaxResidency', required: true },
    { key: 'identificationNumber', required: true },
    { key: 'residentialAddress', required: true },
    { key: 'phoneNumber', required: true },
    { key: 'emailAddress', type: 'email', required: true },
    { key: 'sourceOfWealth', type: 'textarea', required: true, footnoteKey: 'footnote_source_of_wealth' },
    { key: 'sourceOfFunds', type: 'textarea', required: true, footnoteKey: 'footnote_source_of_funds' },
    { key: 'employmentHistory', type: 'employment_history' },
    { key: 'purposeOfInvestment', required: true, footnoteKey: 'footnote_purpose_of_investment' },
  ]},
  { section: 'section_payment', fields: [
    { key: 'bankName', required: true },
    { key: 'bankSwiftCode', required: true },
    { key: 'bankAddressCountry', required: true },
    { key: 'accountName', required: true },
    { key: 'accountNumber', required: true },
  ]},
];

const CORPORATE_FIELDS: SectionDef[] = [
  { section: 'section_subscription', fields: [
    { key: 'investorName', readOnly: true, required: true },
    { key: 'shareClass', readOnly: true, required: true },
    { key: 'subscriptionDate', type: 'month_end', required: true, footnoteKey: 'footnote_subscription_date' },
    { key: 'subscriptionAmount', required: true, footnoteKey: 'footnote_subscription_amount' },
  ]},
  { section: 'section_investor', fields: [
    { key: 'dateOfFormation', type: 'date', required: true },
    { key: 'jurisdiction', required: true },
    { key: 'taxIdNumber', required: true },
    { key: 'fiscalYearEnd', required: true },
    { key: 'natureOfBusiness', required: true },
    { key: 'address', required: true },
    { key: 'phoneNumber', required: true },
    { key: 'emailAddress', type: 'email', required: true },
    { key: 'sourceOfWealth', type: 'textarea', required: true, footnoteKey: 'footnote_source_of_wealth' },
    { key: 'sourceOfFunds', type: 'textarea', required: true, footnoteKey: 'footnote_source_of_funds_corporate' },
    { key: 'purposeOfInvestment', required: true, footnoteKey: 'footnote_purpose_of_investment' },
  ]},
  { section: 'section_payment', fields: [
    { key: 'bankName', required: true },
    { key: 'bankSwiftCode', required: true },
    { key: 'bankAddressCountry', required: true },
    { key: 'accountName', required: true },
    { key: 'accountNumber', required: true },
  ]},
];

export function InvestorForm({
  token,
  investorName,
  investorType,
  shareClass,
  expiresAt,
  savedFormData,
  uploadedFiles: initialUploadedFiles,
  submittedVersionCount: initialVersionCount,
  lastSubmittedAt: initialLastSubmittedAt,
}: InvestorFormProps) {
  const [lang, setLang] = useState<Language>('zh');
  const [formData, setFormData] = useState<Record<string, string>>(() => ({
    ...savedFormData,
    // Override with admin-set values (immutable on client)
    investorName,
    shareClass: shareClass || '',
  }));
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>(initialUploadedFiles);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [versionCount, setVersionCount] = useState(initialVersionCount);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(initialLastSubmittedAt);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [classDocuments, setClassDocuments] = useState<Array<{ id: string; name: string; description: string; originalName: string; mimeType: string; fileSize: number }>>([]);

  // Fetch share-class documents
  useEffect(() => {
    if (!shareClass) return;
    fetch(`/api/class-documents?shareClass=${encodeURIComponent(shareClass)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.documents) setClassDocuments(data.documents); })
      .catch(() => {});
  }, [shareClass]);

  const [addressVerification, setAddressVerification] = useState<{
    status: 'pending' | 'matched' | 'mismatched' | 'failed' | 'skipped';
    extracted_address: string;
    reason: string;
  } | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const verifyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger Claude Vision address verification (debounced)
  const triggerAddressVerify = useCallback((address: string, immediate = false) => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    const run = async () => {
      setAddressVerification({ status: 'pending', extracted_address: '', reason: '' });
      try {
        const res = await fetch('/api/submission/verify-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, userAddress: address }),
        });
        const data = await res.json();
        if (data.skipped) {
          setAddressVerification(null);
        } else if (data.verification) {
          setAddressVerification(data.verification);
        }
      } catch {
        setAddressVerification({ status: 'failed', extracted_address: '', reason: 'Network error' });
      }
    };
    if (immediate) run();
    else verifyTimerRef.current = setTimeout(run, 3000);
  }, [token]);

  // Load existing verification state on mount
  useEffect(() => {
    if (investorType !== 'individual') return;
    fetch(`/api/submission/verify-address?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.verification) setAddressVerification(data.verification); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections = investorType === 'individual' ? INDIVIDUAL_FIELDS : CORPORATE_FIELDS;
  const docTypes = investorType === 'individual' ? INDIVIDUAL_DOCUMENT_TYPES : CORPORATE_DOCUMENT_TYPES;

  // Asset proof is waived when subscription amount > USD 1,000,000
  const waivesAssetProof = (() => {
    const raw = formData.subscriptionAmount || '';
    const n = Number(raw.replace(/[^0-9.]/g, ''));
    return !isNaN(n) && n > 1_000_000;
  })();

  // Auto-save with debounce
  const autoSave = useCallback(async (data: Record<string, string>) => {
    setSaving(true);
    try {
      await fetch('/api/submission/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, formData: data }),
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error('Auto-save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [token]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [key]: value };

      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => autoSave(updated), 1000);

      // Trigger address verification only when both address proof is uploaded
      // AND residential address is filled
      if (investorType === 'individual' && key === 'residentialAddress') {
        const hasProof = uploadedFiles.some(f => f.documentType === 'address_proof');
        if (hasProof && value.trim()) {
          triggerAddressVerify(value);
        }
      }

      return updated;
    });
  }, [autoSave, investorType, triggerAddressVerify, uploadedFiles]);

  const handleFileUploaded = useCallback((file: { id: string; originalName: string; fileSize: number; documentType: string }) => {
    setUploadedFiles(prev => {
      const isMultiple = file.documentType.startsWith('personnel_');
      if (isMultiple) {
        return [...prev, {
          id: file.id,
          documentType: file.documentType,
          originalName: file.originalName,
          mimeType: '',
          fileSize: file.fileSize,
          uploadedAt: new Date().toISOString(),
        }];
      }
      // Replace existing file of same type
      return [
        ...prev.filter(f => f.documentType !== file.documentType),
        {
          id: file.id,
          documentType: file.documentType,
          originalName: file.originalName,
          mimeType: '',
          fileSize: file.fileSize,
          uploadedAt: new Date().toISOString(),
        },
      ];
    });

    // Verify address immediately after address_proof upload
    if (investorType === 'individual' && file.documentType === 'address_proof') {
      const currentAddress = formData.residentialAddress || '';
      if (currentAddress.trim()) {
        triggerAddressVerify(currentAddress, true);
      }
    }
  }, [investorType, formData.residentialAddress, triggerAddressVerify]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');

    // Save form data first
    await autoSave(formData);

    try {
      const res = await fetch('/api/submission/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          setSubmitError(data.details.map((d: { message: string; path: string[] }) => `${d.path.join('.')}: ${d.message}`).join('; '));
        } else if (data.missingDocs) {
          setSubmitError(`缺少必要文件 / Missing documents: ${data.missingDocs.map((d: string) => t(d, lang)).join(', ')}`);
        } else {
          setSubmitError(data.error);
        }
        return;
      }
      setVersionCount(data.versionNumber);
      setLastSubmittedAt(new Date().toISOString());
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 5000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">奕卓資本 / Capella Alpha Fund</h1>
            <p className="text-sm text-gray-500">
              {investorType === 'individual' ? '个人信息收集 / Individual KYC' : '公司信息收集 / Corporate KYC'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {saving ? (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {t('save_draft', lang)}...
                </span>
              ) : lastSaved ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {t('saved', lang)} {lastSaved.toLocaleTimeString()}
                </span>
              ) : null}
              <button
                onClick={() => {
                  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                  autoSave(formData);
                }}
                disabled={saving}
                className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('save_draft', lang)}
              </button>
            </div>
            <LanguageToggle lang={lang} onToggle={setLang} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Submission status banner */}
        {justSubmitted && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <div>
              <p className="text-sm font-medium text-green-800">提交成功！Submission successful!</p>
              <p className="text-xs text-green-700 mt-1">您已提交版本 {versionCount}。您仍可继续修改并再次提交。 / You have submitted version {versionCount}. You can still edit and submit again.</p>
            </div>
          </div>
        )}
        {!justSubmitted && versionCount > 0 && lastSubmittedAt && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="text-sm font-medium text-blue-800">
                已提交 {versionCount} 次 / Submitted {versionCount} time{versionCount > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                上次提交 / Last submitted: {new Date(lastSubmittedAt).toLocaleString()}
                <br />
                您可以继续编辑并再次提交更新版本。 / You can continue editing and submit an updated version.
              </p>
            </div>
          </div>
        )}

        {/* Expiry notice */}
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          有效期至 / Valid until: {new Date(expiresAt).toLocaleDateString()} {new Date(expiresAt).toLocaleTimeString()}
        </div>

        {/* Form sections */}
        {sections.map((section) => (
          <div key={section.section} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              {t(section.section, lang)}
            </h2>
            {section.fields.map((field) => {
              if (field.type === 'month_end') {
                return (
                  <MonthEndDateField
                    key={field.key}
                    fieldKey={field.key}
                    lang={lang}
                    value={formData[field.key] || ''}
                    onChange={(value) => handleFieldChange(field.key, value)}
                    required={field.required}
                    footnoteKey={field.footnoteKey}
                  />
                );
              }
              if (field.type === 'employment_history') {
                return (
                  <EmploymentHistorySection
                    key={field.key}
                    lang={lang}
                    value={formData[field.key] || ''}
                    onChange={(value) => handleFieldChange(field.key, value)}
                  />
                );
              }
              return (
                <FormField
                  key={field.key}
                  fieldKey={field.key}
                  lang={lang}
                  value={formData[field.key] || ''}
                  onChange={(value) => handleFieldChange(field.key, value)}
                  type={field.type}
                  readOnly={field.readOnly}
                  required={field.required}
                  footnoteKey={field.footnoteKey}
                />
              );
            })}
          </div>
        ))}

        {/* Document uploads */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
            {t('section_documents', lang)}
          </h2>

          {investorType === 'individual' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              {t('footnote_asset_proof', lang)}
            </div>
          )}
          {investorType === 'individual' && waivesAssetProof && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {t('footnote_asset_proof_waived', lang)}
            </div>
          )}

          {/* Address verification banner */}
          {investorType === 'individual' && addressVerification && (
            <div className={`mb-4 p-3 border rounded-lg text-sm ${
              addressVerification.status === 'matched'
                ? 'bg-green-50 border-green-200 text-green-700'
                : addressVerification.status === 'mismatched'
                ? 'bg-red-50 border-red-300 text-red-700'
                : addressVerification.status === 'pending'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
              <div className="flex items-start gap-2">
                {addressVerification.status === 'matched' && (
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                )}
                {addressVerification.status === 'mismatched' && (
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                )}
                {addressVerification.status === 'pending' && (
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                )}
                <div className="flex-1">
                  {addressVerification.status === 'matched' && (
                    <p className="font-medium">地址核对通过 / Address matches the uploaded proof.</p>
                  )}
                  {addressVerification.status === 'mismatched' && (
                    <>
                      <p className="font-medium">
                        地址不匹配 / Address does not match the uploaded proof
                      </p>
                      <p className="text-xs mt-1">
                        文件中读取到 / Found on document: <code className="bg-white px-1 rounded">{addressVerification.extracted_address || '(not found)'}</code>
                      </p>
                      {addressVerification.reason && <p className="text-xs mt-1 opacity-80">{addressVerification.reason}</p>}
                      <p className="text-xs mt-2">
                        您仍可保存草稿和提交；请确保地址证明与填写的地址一致。/ You can still save and submit, but please make sure the address matches.
                      </p>
                    </>
                  )}
                  {addressVerification.status === 'pending' && (
                    <p>正在核对地址... / Verifying address...</p>
                  )}
                  {addressVerification.status === 'failed' && (
                    <p className="text-xs">地址核对服务暂时不可用 / Address verification is temporarily unavailable.</p>
                  )}
                  {addressVerification.status === 'skipped' && (
                    <p className="text-xs">
                      {addressVerification.reason || '地址核对已跳过 / Verification skipped.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {investorType === 'corporate' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              {t('footnote_corporate_asset', lang)}
            </div>
          )}

          {docTypes.map((doc) => {
            const existingFile = uploadedFiles.find(f => f.documentType === doc.key);
            const isMultiple = 'multiple' in doc && doc.multiple;
            // liquid_asset_proof is waived if subscription amount > USD 1M
            const isAssetProof = doc.key === 'liquid_asset_proof';
            const required = isAssetProof && waivesAssetProof ? false : doc.required;
            return (
              <FileDropzone
                key={doc.key}
                token={token}
                documentType={doc.key}
                label={t(doc.key, lang)}
                required={required}
                existingFile={existingFile ? {
                  id: existingFile.id,
                  originalName: existingFile.originalName,
                  fileSize: existingFile.fileSize,
                } : undefined}
                onUploaded={handleFileUploaded}
                multiple={isMultiple}
              />
            );
          })}

          {/* Payment proof (optional, multiple) */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <FileDropzone
              token={token}
              documentType="payment_proof"
              label={t('payment_proof', lang) + ` (${lang === 'zh' ? '选填' : 'Optional'})`}
              required={false}
              onUploaded={handleFileUploaded}
              multiple
            />
            {(() => {
              const ppFiles = uploadedFiles.filter(f => f.documentType === 'payment_proof');
              return ppFiles.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {ppFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-sm text-gray-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className="truncate flex-1">{f.originalName}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{f.fileSize < 1024 * 1024 ? `${(f.fileSize / 1024).toFixed(0)} KB` : `${(f.fileSize / (1024 * 1024)).toFixed(1)} MB`}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        </div>

        {/* Submit */}
        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          {versionCount > 0 ? (
            <>
              您的修改会自动保存。点击下方按钮提交更新版本。您可以多次提交。
              <br />
              Your changes are auto-saved. Click below to submit an updated version. Multiple submissions are allowed.
            </>
          ) : (
            <>
              您的表单会自动保存。请在确认所有信息无误后点击下方按钮提交。提交后仍可继续修改。
              <br />
              Your form is auto-saved. Click below when ready to submit. You can still edit and resubmit afterward.
            </>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold text-lg"
        >
          {submitting
            ? '提交中... / Submitting...'
            : versionCount > 0
              ? `提交新版本 / Submit New Version (v${versionCount + 1})`
              : '提交 / Submit'}
        </button>

        <p className="mt-4 text-center text-sm text-gray-400">
          您可以随时关闭页面，稍后再次登录继续填写。 / You can close this page and log in again later to continue.
        </p>

        {/* Share-class documents for download */}
        {classDocuments.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {lang === 'zh' ? `${shareClass} 相关文件下载` : `${shareClass} Documents`}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {lang === 'zh'
                ? '以下文件供您参考和下载。'
                : 'The following documents are available for your reference.'}
            </p>
            <div className="space-y-2">
              {classDocuments.map(doc => (
                <a
                  key={doc.id}
                  href={`/api/class-documents/${doc.id}`}
                  download
                  className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate">{doc.name}</p>
                    {doc.description && <p className="text-xs text-gray-500 truncate">{doc.description}</p>}
                    <p className="text-xs text-gray-400">{doc.fileSize < 1024 * 1024 ? `${(doc.fileSize / 1024).toFixed(0)} KB` : `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
