'use client';

import { type Language } from '@/lib/i18n';

interface LanguageToggleProps {
  lang: Language;
  onToggle: (lang: Language) => void;
}

export function LanguageToggle({ lang, onToggle }: LanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(lang === 'zh' ? 'en' : 'zh')}
      className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
    >
      {lang === 'zh' ? 'English' : '中文'}
    </button>
  );
}
