'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type Language, t } from '@/lib/i18n';
import { type UploadedFileInfo } from '@/lib/types';
import { LanguageToggle } from './LanguageToggle';
import { FormField } from './FormField';
import { MonthEndDateField } from './MonthEndDateField';
import { FileDropzone } from './FileDropzone';

interface TopUpFormProps {
  token: string;
  investorName: string;
  shareClass: string | null;
  expiresAt: string;
  savedFormData: Record<string, string>;
  uploadedFiles: UploadedFileInfo[];
  submittedVersionCount: number;
  lastSubmittedAt: string | null;
}

export function TopUpForm({
  token,
  investorName,
  shareClass,
  expiresAt,
  savedFormData,
  uploadedFiles: initialUploadedFiles,
  submittedVersionCount: initialVersionCount,
  lastSubmittedAt: initialLastSubmittedAt,
}: TopUpFormProps) {
  const [lang, setLang] = useState<Language>('zh');
  const [formData, setFormData] = useState<Record<string, string>>(() => ({
    ...savedFormData,
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
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [classDocuments, setClassDocuments] = useState<Array<{ id: string; name: string; description: string; originalName: string; mimeType: string; fileSize: number }>>([]);

  useEffect(() => {
    if (!shareClass) return;
    fetch(`/api/class-documents?shareClass=${encodeURIComponent(shareClass)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.documents) setClassDocuments(data.documents); })
      .catch(() => {});
  }, [shareClass]);

  const paymentProofFiles = uploadedFiles.filter(f => f.documentType === 'payment_proof');

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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => autoSave(updated), 1000);
      return updated;
    });
  }, [autoSave]);

  const handleFileUploaded = useCallback((file: { id: string; originalName: string; fileSize: number; documentType: string }) => {
    setUploadedFiles(prev => [...prev, {
      id: file.id,
      documentType: file.documentType,
      originalName: file.originalName,
      mimeType: '',
      fileSize: file.fileSize,
      uploadedAt: new Date().toISOString(),
    }]);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
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
          setSubmitError(`缺少必要文件 / Missing: ${data.missingDocs.map((d: string) => t(d, lang)).join(', ')}`);
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

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">奕卓資本 / Capella Alpha Fund</h1>
            <p className="text-sm text-gray-500">追加投资 / Top-up Subscription</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {saving ? (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {t('save_draft', lang)}
                </span>
              ) : lastSaved ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {t('saved', lang)} {lastSaved.toLocaleTimeString()}
                </span>
              ) : null}
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
              <p className="text-xs text-green-700 mt-1">您已提交版本 {versionCount}。 / You have submitted version {versionCount}.</p>
            </div>
          </div>
        )}
        {!justSubmitted && versionCount > 0 && lastSubmittedAt && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            已提交 {versionCount} 次 / Submitted {versionCount} time{versionCount > 1 ? 's' : ''}. 上次提交 / Last: {new Date(lastSubmittedAt).toLocaleString()}
          </div>
        )}

        {/* Expiry notice */}
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          有效期至 / Valid until: {new Date(expiresAt).toLocaleDateString()} {new Date(expiresAt).toLocaleTimeString()}
        </div>

        {/* Subscription section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
            {t('section_topup', lang)}
          </h2>
          <FormField
            fieldKey="investorName"
            lang={lang}
            value={formData.investorName || ''}
            onChange={() => {}}
            readOnly
            required
          />
          {shareClass && (
            <FormField
              fieldKey="shareClass"
              lang={lang}
              value={formData.shareClass || ''}
              onChange={() => {}}
              readOnly
              required
            />
          )}
          <MonthEndDateField
            fieldKey="subscriptionDate"
            lang={lang}
            value={formData.subscriptionDate || ''}
            onChange={(v) => handleFieldChange('subscriptionDate', v)}
            required
            footnoteKey="footnote_subscription_date"
          />
          <FormField
            fieldKey="subscriptionAmount"
            lang={lang}
            value={formData.subscriptionAmount || ''}
            onChange={(v) => handleFieldChange('subscriptionAmount', v)}
            required
            footnoteKey="footnote_subscription_amount"
          />
        </div>

        {/* Payment proof */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
            {t('section_topup_documents', lang)}
          </h2>
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            {t('topup_bank_notice', lang)}
          </div>
          <FileDropzone
            token={token}
            documentType="payment_proof"
            label={t('payment_proof', lang)}
            required
            onUploaded={handleFileUploaded}
            multiple
          />
          {paymentProofFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              {paymentProofFiles.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-sm text-gray-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="truncate">{f.originalName}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{f.fileSize < 1024 * 1024 ? `${(f.fileSize / 1024).toFixed(0)} KB` : `${(f.fileSize / (1024 * 1024)).toFixed(1)} MB`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}
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
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
