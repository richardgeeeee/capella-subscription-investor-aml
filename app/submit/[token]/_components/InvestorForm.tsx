'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type Language, t } from '@/lib/i18n';
import { type InvestorType, type UploadedFileInfo } from '@/lib/types';
import { INDIVIDUAL_DOCUMENT_TYPES, CORPORATE_DOCUMENT_TYPES } from '@/lib/constants';
import { LanguageToggle } from './LanguageToggle';
import { FormField } from './FormField';
import { FileDropzone } from './FileDropzone';

interface InvestorFormProps {
  token: string;
  investorName: string;
  investorType: InvestorType;
  expiresAt: string;
  savedFormData: Record<string, string>;
  uploadedFiles: UploadedFileInfo[];
  isFinalized: boolean;
}

interface FieldDef {
  key: string;
  type?: 'text' | 'date' | 'email' | 'number' | 'textarea';
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
    { key: 'subscriptionDate', type: 'date', required: true },
    { key: 'subscriptionAmount', required: true },
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
    { key: 'sourceOfFunds', type: 'textarea', required: true },
    { key: 'employerName' },
    { key: 'title' },
    { key: 'employmentPeriod' },
    { key: 'purposeOfInvestment', required: true },
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
    { key: 'subscriptionDate', type: 'date', required: true },
    { key: 'subscriptionAmount', required: true },
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
    { key: 'purposeOfInvestment', required: true },
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
  expiresAt,
  savedFormData,
  uploadedFiles: initialUploadedFiles,
  isFinalized: initialIsFinalized,
}: InvestorFormProps) {
  const [lang, setLang] = useState<Language>('zh');
  const [formData, setFormData] = useState<Record<string, string>>({
    investorName,
    ...savedFormData,
  });
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>(initialUploadedFiles);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isFinalized, setIsFinalized] = useState(initialIsFinalized);
  const [submitError, setSubmitError] = useState('');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const sections = investorType === 'individual' ? INDIVIDUAL_FIELDS : CORPORATE_FIELDS;
  const docTypes = investorType === 'individual' ? INDIVIDUAL_DOCUMENT_TYPES : CORPORATE_DOCUMENT_TYPES;

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

      return updated;
    });
  }, [autoSave]);

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
  }, []);

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
      setIsFinalized(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (isFinalized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('success_title', lang)}</h1>
          <p className="text-gray-600">{t('success_message', lang)}</p>
        </div>
      </div>
    );
  }

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
            {section.fields.map((field) => (
              <FormField
                key={field.key}
                fieldKey={field.key}
                lang={lang}
                value={formData[field.key] || ''}
                onChange={(value) => handleFieldChange(field.key, value)}
                type={field.type}
                readOnly={field.readOnly}
                required={field.required}
                footnote={field.footnoteKey ? t(field.footnoteKey, lang) : undefined}
              />
            ))}
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
          {investorType === 'corporate' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              {t('footnote_corporate_asset', lang)}
            </div>
          )}

          {docTypes.map((doc) => {
            const existingFile = uploadedFiles.find(f => f.documentType === doc.key);
            const isMultiple = 'multiple' in doc && doc.multiple;
            return (
              <FileDropzone
                key={doc.key}
                token={token}
                documentType={doc.key}
                label={t(doc.key, lang)}
                required={doc.required}
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
        </div>

        {/* Submit */}
        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          您的表单会自动保存。请在确认所有信息无误后点击下方按钮最终提交。
          <br />
          Your form is auto-saved. Click below only when you are ready to finalize.
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold text-lg"
        >
          {submitting ? '提交中... / Submitting...' : '最终提交 / Submit Final'}
        </button>

        <p className="mt-4 text-center text-sm text-gray-400">
          您可以随时关闭页面，稍后再次登录继续填写。 / You can close this page and log in again later to continue.
        </p>
      </div>
    </div>
  );
}
