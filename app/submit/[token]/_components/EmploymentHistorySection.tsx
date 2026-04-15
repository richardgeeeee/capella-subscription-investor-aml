'use client';

import { type Language, t } from '@/lib/i18n';

export interface EmploymentEntry {
  employerName: string;
  natureOfBusiness: string;
  startYear: string;
  startMonth: string;
  endYear: string;   // empty = Present
  endMonth: string;  // empty = Present
}

interface Props {
  lang: Language;
  value: string; // JSON string of EmploymentEntry[]
  onChange: (json: string) => void;
}

function emptyEntry(): EmploymentEntry {
  return { employerName: '', natureOfBusiness: '', startYear: '', startMonth: '', endYear: '', endMonth: '' };
}

function parseEntries(json: string): EmploymentEntry[] {
  if (!json) return [emptyEntry()];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((e: Partial<EmploymentEntry>) => ({ ...emptyEntry(), ...e }));
    }
  } catch {
    // ignore
  }
  return [emptyEntry()];
}

const MONTHS: { value: string; en: string; zh: string }[] = [
  { value: '01', en: 'Jan', zh: '1月' },
  { value: '02', en: 'Feb', zh: '2月' },
  { value: '03', en: 'Mar', zh: '3月' },
  { value: '04', en: 'Apr', zh: '4月' },
  { value: '05', en: 'May', zh: '5月' },
  { value: '06', en: 'Jun', zh: '6月' },
  { value: '07', en: 'Jul', zh: '7月' },
  { value: '08', en: 'Aug', zh: '8月' },
  { value: '09', en: 'Sep', zh: '9月' },
  { value: '10', en: 'Oct', zh: '10月' },
  { value: '11', en: 'Nov', zh: '11月' },
  { value: '12', en: 'Dec', zh: '12月' },
];

export function EmploymentHistorySection({ lang, value, onChange }: Props) {
  const entries = parseEntries(value);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 60 }, (_, i) => String(currentYear - i));
  const otherLang: Language = lang === 'zh' ? 'en' : 'zh';

  const update = (idx: number, patch: Partial<EmploymentEntry>) => {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange(JSON.stringify(next));
  };

  const add = () => onChange(JSON.stringify([...entries, emptyEntry()]));

  const remove = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    onChange(JSON.stringify(next.length > 0 ? next : [emptyEntry()]));
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-sm';
  const selectCls = 'px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-sm';

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {t('section_employment_history', lang)}
        {t('section_employment_history', lang) !== t('section_employment_history', otherLang) && (
          <span className="text-gray-400 font-normal ml-2">{t('section_employment_history', otherLang)}</span>
        )}
      </label>
      <p className="text-xs text-gray-500 mb-3">{t('footnote_employment_history', 'zh')}</p>
      <p className="text-xs text-gray-400 mb-3">{t('footnote_employment_history', 'en')}</p>

      <div className="space-y-4">
        {entries.map((entry, idx) => (
          <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">#{idx + 1}</span>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  {t('remove_employment', lang)}
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t('employerName', lang)}
                <span className="text-gray-400 ml-1">{t('employerName', otherLang)}</span>
              </label>
              <input
                type="text"
                value={entry.employerName}
                onChange={e => update(idx, { employerName: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t('natureOfBusinessEmployer', lang)}
                <span className="text-gray-400 ml-1">{t('natureOfBusinessEmployer', otherLang)}</span>
              </label>
              <input
                type="text"
                value={entry.natureOfBusiness}
                onChange={e => update(idx, { natureOfBusiness: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">{t('employment_start', lang)}</label>
                <div className="flex gap-2">
                  <select
                    value={entry.startYear}
                    onChange={e => update(idx, { startYear: e.target.value })}
                    className={selectCls + ' flex-1'}
                  >
                    <option value="">{t('year', lang)}</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={entry.startMonth}
                    onChange={e => update(idx, { startMonth: e.target.value })}
                    className={selectCls + ' flex-1'}
                  >
                    <option value="">{t('month', lang)}</option>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m[lang]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  {t('employment_end', lang)}
                  <span className="text-gray-400 ml-1">({t('employment_present_hint', lang)})</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={entry.endYear}
                    onChange={e => update(idx, { endYear: e.target.value })}
                    className={selectCls + ' flex-1'}
                  >
                    <option value="">{t('employment_present', lang)}</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={entry.endMonth}
                    onChange={e => update(idx, { endMonth: e.target.value })}
                    className={selectCls + ' flex-1'}
                    disabled={!entry.endYear}
                  >
                    <option value="">{t('month', lang)}</option>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m[lang]}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50"
      >
        + {t('add_employment', lang)}
      </button>
    </div>
  );
}

/** Formats a single entry as "Employer (Business) — YYYY-MM to YYYY-MM" for display. */
export function formatEmploymentEntry(entry: EmploymentEntry): string {
  const start = entry.startYear && entry.startMonth ? `${entry.startYear}-${entry.startMonth}` : entry.startYear || '';
  const end = entry.endYear && entry.endMonth ? `${entry.endYear}-${entry.endMonth}` : (entry.endYear || 'Present');
  const period = start || end !== 'Present' ? `${start || '?'} – ${end}` : '';
  const business = entry.natureOfBusiness ? ` (${entry.natureOfBusiness})` : '';
  return `${entry.employerName || '?'}${business}${period ? ' — ' + period : ''}`;
}
