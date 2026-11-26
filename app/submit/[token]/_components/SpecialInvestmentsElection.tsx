'use client';

import { type Language, t } from '@/lib/i18n';

interface SpecialInvestmentsElectionProps {
  lang: Language;
  value: string;
  onChange: (value: string) => void;
}

export function SpecialInvestmentsElection({ lang, value, onChange }: SpecialInvestmentsElectionProps) {
  const otherLang: Language = lang === 'zh' ? 'en' : 'zh';

  const renderOption = (optionValue: string, labelKey: string, descKey: string) => {
    const selected = value === optionValue;
    return (
      <label
        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
      >
        <input
          type="radio"
          name="specialInvestmentsElection"
          value={optionValue}
          checked={selected}
          onChange={() => onChange(optionValue)}
          className="mt-1 w-4 h-4 flex-shrink-0 text-blue-600 border-gray-300 focus:ring-blue-500"
        />
        <div>
          <p className="text-sm text-gray-900">
            <strong>{t(labelKey, lang)}</strong> {t(descKey, lang)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            <strong>{t(labelKey, otherLang)}</strong> {t(descKey, otherLang)}
          </p>
        </div>
      </label>
    );
  };

  return (
    <div className="mb-8 border-2 border-gray-300 rounded-lg bg-gray-50 p-5">
      <h2 className="text-lg font-semibold text-gray-900">
        {t('section_special_investments', lang)}
        <span className="text-red-500 ml-1">*</span>
      </h2>
      <p className="text-sm text-gray-400 mb-4">{t('section_special_investments', otherLang)}</p>

      <p className="text-sm text-gray-700">{t('si_intro', lang)}</p>
      <p className="text-xs text-gray-400 mt-1 mb-4">{t('si_intro', otherLang)}</p>

      <div className="space-y-3">
        {renderOption('elect', 'si_elect_label', 'si_elect_desc')}
        {renderOption('do_not_elect', 'si_no_elect_label', 'si_no_elect_desc')}
      </div>
    </div>
  );
}
