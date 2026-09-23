'use client';

import { type Language, t } from '@/lib/i18n';

interface PhoneWithCallbackFieldProps {
  fieldKey: string;
  lang: Language;
  value: string;
  onChange: (value: string) => void;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  required?: boolean;
}

/** Phone number input with the callback-authorization consent checkbox attached below it. */
export function PhoneWithCallbackField({
  fieldKey,
  lang,
  value,
  onChange,
  checked,
  onCheckedChange,
  required = false,
}: PhoneWithCallbackFieldProps) {
  const otherLang: Language = lang === 'zh' ? 'en' : 'zh';
  const label = t(fieldKey, lang);
  const subLabel = t(fieldKey, otherLang);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {label !== subLabel && (
          <span className="text-gray-400 font-normal ml-2">{subLabel}</span>
        )}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
      />

      <label className="flex items-start gap-2 mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">
          {t('callbackAuthorized', lang)}
          <span className="text-gray-400 ml-2">{t('callbackAuthorized', otherLang)}</span>
        </span>
      </label>

      <div className="mt-1 space-y-0.5 pl-6">
        <p className="text-xs text-gray-500">{t('footnote_callback_authorized', 'zh')}</p>
        <p className="text-xs text-gray-400">{t('footnote_callback_authorized', 'en')}</p>
      </div>
    </div>
  );
}
