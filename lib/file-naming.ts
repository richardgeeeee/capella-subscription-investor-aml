/**
 * File naming helpers for renaming uploaded documents and folders
 * following Capella's naming convention.
 *
 * Schema:
 * - File: `{LASTNAME FirstName}-{Document Label}.{ext}`
 * - Drive folder: `{seq} {First Name} {Last Name}`
 * - Agreement: `{LASTNAME FirstName}- {Agreement Type}_{DDMM} {Mmm} {YYYY}.{ext}`
 */

// Simplified English labels for document types (matches Capella's manual naming).
const DOC_LABELS: Record<string, string> = {
  // Individual
  passport_front: 'Passport Front',
  passport_signature: 'Passport Signature',
  id_card: 'ID Card',
  address_proof: 'Address proof',
  liquid_asset_proof: 'Asset proof',

  // Corporate
  certificate_of_incorporation: 'Certificate of Incorporation',
  memorandum_articles: 'Memorandum & Articles',
  certificate_of_incumbency: 'Certificate of Incumbency',
  register_of_directors: 'Register of Directors',
  register_of_members: 'Register of Members',
  board_resolution: 'Board Resolution',
  authorised_signatory_list: 'Authorised Signatory List',
  investment_declaration: 'Investment Declaration',
  org_structure_chart: 'Org Structure Chart',
  source_description: 'Source of Funds',
  fatca_crs_form: 'FATCA-CRS Form',
  audited_financial_statements: 'Audited Financial Statements',
  personnel_passport_front: 'Personnel Passport Front',
  personnel_passport_signature: 'Personnel Passport Signature',
  personnel_id_card: 'Personnel ID Card',
  personnel_address_proof: 'Personnel Address proof',
};

export function getDocLabel(documentType: string): string {
  return DOC_LABELS[documentType] || documentType;
}

/** "ZHANG Jin" — uppercase last name, capitalised first name */
export function namePrefix(firstName: string | null, lastName: string | null, fallback: string): string {
  if (firstName && lastName) {
    return `${lastName.toUpperCase()} ${firstName}`;
  }
  return fallback;
}

/** "ZHANG Jin-HKID.pdf" */
export function formatDisplayName(
  firstName: string | null,
  lastName: string | null,
  fallbackName: string,
  documentType: string,
  originalFileName: string,
  sequenceSuffix?: number
): string {
  const prefix = namePrefix(firstName, lastName, fallbackName);
  const label = getDocLabel(documentType);
  const ext = extractExt(originalFileName);
  const suffix = sequenceSuffix && sequenceSuffix > 1 ? ` (${sequenceSuffix})` : '';
  return `${prefix}-${label}${suffix}${ext}`;
}

/** "001 ZHANG Jin" — seq, uppercase last name, first name. */
export function formatDriveFolderName(
  firstName: string | null,
  lastName: string | null,
  fallbackName: string,
  sequenceNumber: number | null
): string {
  const seq = String(sequenceNumber || 0).padStart(3, '0');
  const namePart = firstName && lastName ? `${lastName.toUpperCase()} ${firstName}` : fallbackName;
  return `${seq} ${namePart}`;
}

/**
 * "ZHANG Jin- Individual Client Agreement_3004 Apr 2026.docx"
 * - subscriptionDate: ISO date string YYYY-MM-DD (always month-end)
 */
export function formatAgreementName(
  firstName: string | null,
  lastName: string | null,
  fallbackName: string,
  agreementType: string,
  subscriptionDate: string,
  ext: string
): string {
  const prefix = namePrefix(firstName, lastName, fallbackName);
  const dateLabel = formatAgreementDate(subscriptionDate);
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${prefix}- ${agreementType}_${dateLabel}${cleanExt}`;
}

/** "2026-04-30" → "3004 Apr 2026" */
function formatAgreementDate(subscriptionDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(subscriptionDate)) return subscriptionDate;
  const [year, month, day] = subscriptionDate.split('-');
  const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('en-US', { month: 'short' });
  return `${day}${month} ${monthName} ${year}`;
}

/** "jzhang" — first-name initial + full last name, all lowercase. Used as ?n= in links. */
export function formatLinkTag(firstName: string | null, lastName: string | null): string {
  const f = (firstName || '').trim().toLowerCase();
  const l = (lastName || '').trim().toLowerCase();
  if (!f || !l) return '';
  return `${f.charAt(0)}${l}`;
}

function extractExt(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return '';
  return fileName.slice(idx);
}
