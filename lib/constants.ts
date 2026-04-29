export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export const INDIVIDUAL_DOCUMENT_TYPES = [
  { key: 'passport_front', required: true, multiple: true },
  { key: 'id_card', required: true, multiple: true },
  { key: 'address_proof', required: true },
  { key: 'liquid_asset_proof', required: true },
] as const;

/** USD amount threshold above which liquid_asset_proof is waived */
export const ASSET_PROOF_WAIVER_THRESHOLD = 1_000_000;

export const CORPORATE_DOCUMENT_TYPES = [
  { key: 'certificate_of_incorporation', required: true },
  { key: 'memorandum_articles', required: true },
  { key: 'certificate_of_incumbency', required: true },
  { key: 'register_of_directors', required: true },
  { key: 'register_of_members', required: true },
  { key: 'board_resolution', required: true },
  { key: 'authorised_signatory_list', required: true },
  { key: 'investment_declaration', required: true },
  { key: 'org_structure_chart', required: true },
  { key: 'source_description', required: true },
  { key: 'fatca_crs_form', required: true },
  { key: 'audited_financial_statements', required: true },
  { key: 'personnel_passport_front', required: true, multiple: true },
  { key: 'personnel_passport_signature', required: true, multiple: true },
  { key: 'personnel_id_card', required: true, multiple: true },
  { key: 'personnel_address_proof', required: true, multiple: true },
] as const;

export const TOPUP_DOCUMENT_TYPES = [
  { key: 'payment_proof', required: true, multiple: true },
] as const;

export const SHARE_CLASSES = ['Class E', 'Class MM', 'Class A', 'Class B'] as const;
export type ShareClass = typeof SHARE_CLASSES[number];

export const DEFAULT_LINK_EXPIRY_DAYS = 30;
export const SESSION_EXPIRY_DAYS = 7;
export const VERIFICATION_CODE_EXPIRY_MINUTES = 10;
export const VERIFICATION_CODE_LENGTH = 6;
