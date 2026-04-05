'use client';

import { type Language, t } from '@/lib/i18n';

interface MonthEndDateFieldProps {
  fieldKey: string;
  lang: Language;
  value: string; // YYYY-MM-DD (end of month)
  onChange: (value: string) => void;
  required?: boolean;
  footnoteKey?: string;
}

// Compute last day of a given YYYY-MM month string
function getLastDayOfMonth(yearMonth: string): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return '';
  const [year, month] = yearMonth.split('-').map(Number);
  // Day 0 of next month = last day of this month
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Extract YYYY-MM from YYYY-MM-DD
function toYearMonth(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 7);
}

export function MonthEndDateField({
  fieldKey,
  lang,
  value,
  onChange,
  required = false,
  footnoteKey,
}: MonthEndDateFieldProps) {
  const label = t(fieldKey, lang);
  const otherLang = lang === 'zh' ? 'en' : 'zh';
  const subLabel = t(fieldKey, otherLang);

  const yearMonth = toYearMonth(value);

  const handleChange = (ym: string) => {
    onChange(ym ? getLastDayOfMonth(ym) : '');
  };

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
        type="month"
        value={yearMonth}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
      />
      {value && (
        <p className="mt-1 text-xs text-blue-600">
          月底日期 / End of month: <strong>{value}</strong>
        </p>
      )}
      {footnoteKey && (
        <div className="mt-1 space-y-0.5">
          <p className="text-xs text-gray-500">{t(footnoteKey, 'zh')}</p>
          <p className="text-xs text-gray-400">{t(footnoteKey, 'en')}</p>
        </div>
      )}
    </div>
  );
}
