'use client';

import { type Language, t } from '@/lib/i18n';

interface FormFieldProps {
  fieldKey: string;
  lang: Language;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'email' | 'number' | 'textarea';
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  footnote?: string;
  error?: string;
}

export function FormField({
  fieldKey,
  lang,
  value,
  onChange,
  type = 'text',
  readOnly = false,
  required = false,
  placeholder,
  footnote,
  error,
}: FormFieldProps) {
  const label = t(fieldKey, lang);
  const otherLang = lang === 'zh' ? 'en' : 'zh';
  const subLabel = t(fieldKey, otherLang);

  const inputClasses = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
    readOnly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
  } ${error ? 'border-red-500' : 'border-gray-300'}`;

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {label !== subLabel && (
          <span className="text-gray-400 font-normal ml-2">{subLabel}</span>
        )}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className={`${inputClasses} min-h-[80px]`}
          placeholder={placeholder}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className={inputClasses}
          placeholder={placeholder}
        />
      )}
      {footnote && (
        <p className="mt-1 text-xs text-gray-500">{footnote}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
